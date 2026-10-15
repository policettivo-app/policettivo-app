-- ═══════════════════════════════════════════════════════════════════════
-- Migration 058 — Registro di tutte le foto del paziente [foto-archivio-v1]
-- ═══════════════════════════════════════════════════════════════════════
-- COSA AGGIUNGE
--   • tabella foto_storico: una riga per OGNI foto salvata (scheda paziente,
--     visita, posturale), col NUMERO progressivo del paziente e l'ORA.
--     Una foto sostituita non sparisce: la sua riga prende sostituita_il.
--   • foto_registra(...)          → dà il numero successivo, senza doppioni
--   • foto_scheda_imposta(...)    → cambia UNA casella di patients.foto_url
--                                   in un colpo solo (due scatti insieme non
--                                   si cancellano più a vicenda)
--   • foto_segna_sostituita(...)  → segna una foto come tolta dalla casella
--                                   (e la registra se non c'era)
-- ⚠️ TUTTO ADDITIVO: nessuna tabella, colonna, funzione o policy esistente
--    viene toccata o tolta. Si può rilanciare quante volte si vuole.
--    Regole d'accesso = le stesse di visit_photos (can_access_patient /
--    can_edit_patient). Nessuna regola di cancellazione: dal registro non si
--    cancella (solo eliminata_il quando il professionista elimina il file).
-- Ritorno indietro (l'app funziona anche senza: salva come prima, senza numero):
--   drop function if exists public.foto_segna_sostituita(uuid,text,text,text,timestamptz);
--   drop function if exists public.foto_scheda_imposta(uuid,text,jsonb);
--   drop function if exists public.foto_registra(uuid,text,text,uuid,timestamptz);
--   drop table if exists public.foto_storico;
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.foto_storico (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  numero        integer not null,
  origine       text not null,
  casella       text,
  visit_id      uuid,
  storage_path  text,
  scattata_il   timestamptz,                 -- null = data non registrata
  sostituita_il timestamptz,
  eliminata_il  timestamptz,
  creato_il     timestamptz not null default now(),
  creato_da     uuid default auth.uid(),
  constraint foto_storico_numero_unico unique (patient_id, numero),
  constraint foto_storico_origine_ok check (origine in ('scheda','visita','posturale','libera','recupero'))
);
create index if not exists foto_storico_percorso on public.foto_storico (storage_path);

alter table public.foto_storico enable row level security;
revoke all on public.foto_storico from anon;
grant select, insert, update on public.foto_storico to authenticated;

drop policy if exists foto_storico_select_studio on public.foto_storico;
create policy foto_storico_select_studio on public.foto_storico for select
  using (public.can_access_patient(patient_id));
drop policy if exists foto_storico_insert_studio on public.foto_storico;
create policy foto_storico_insert_studio on public.foto_storico for insert
  with check (public.can_edit_patient(patient_id));
drop policy if exists foto_storico_update_studio on public.foto_storico;
create policy foto_storico_update_studio on public.foto_storico for update
  using (public.can_edit_patient(patient_id))
  with check (public.can_edit_patient(patient_id));

-- Numero successivo del paziente + riga nuova. Il lucchetto è per paziente:
-- due scatti nello stesso istante prendono 41 e 42, mai 41 e 41.
create or replace function public.foto_registra(
  p_patient uuid, p_origine text, p_casella text, p_visit uuid, p_scattata timestamptz)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_num integer; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('foto_storico:' || p_patient::text));
  select coalesce(max(f.numero), 0) + 1 into v_num from public.foto_storico f where f.patient_id = p_patient;
  insert into public.foto_storico (patient_id, numero, origine, casella, visit_id, scattata_il)
  values (p_patient, v_num, p_origine, p_casella, p_visit, coalesce(p_scattata, now()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

-- Cambia UNA casella di patients.foto_url (p_valore null = svuota la casella).
-- Restituisce il foto_url nuovo e quello che c'era prima in quella casella.
create or replace function public.foto_scheda_imposta(p_patient uuid, p_slot text, p_valore jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_old text; v_obj jsonb; v_prima jsonb; v_n integer;
begin
  if p_slot is null or p_slot !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'casella non valida: %', p_slot;
  end if;
  select foto_url into v_old from public.patients where id = p_patient for update;
  if not found then raise exception 'paziente non trovato o non autorizzato' using errcode = '42501'; end if;
  begin
    v_obj := coalesce(nullif(btrim(coalesce(v_old, '')), '')::jsonb, '{}'::jsonb);
  exception when others then
    raise exception 'foto_url del paziente non leggibile: non lo tocco';
  end;
  if jsonb_typeof(v_obj) <> 'object' then
    raise exception 'foto_url del paziente non è un elenco di caselle: non lo tocco';
  end if;
  v_prima := v_obj -> p_slot;
  if p_valore is null or p_valore = 'null'::jsonb then
    v_obj := v_obj - p_slot;
  else
    v_obj := jsonb_set(v_obj, array[p_slot], p_valore, true);
  end if;
  update public.patients set foto_url = v_obj::text where id = p_patient;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'non autorizzato a modificare il paziente' using errcode = '42501'; end if;
  return jsonb_build_object('foto_url', v_obj::text, 'prima', v_prima);
end $$;

-- La foto esce dalla casella ma resta: si segna l'ora. Se nel registro non
-- c'era (foto di prima della 058) la si registra adesso, già segnata.
create or replace function public.foto_segna_sostituita(
  p_patient uuid, p_path text, p_origine text, p_casella text, p_scattata timestamptz)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer; v_num integer;
begin
  if p_path is null or p_path = '' then return 0; end if;
  update public.foto_storico set sostituita_il = now()
   where patient_id = p_patient and storage_path = p_path and sostituita_il is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then return v_n; end if;
  if exists (select 1 from public.foto_storico where patient_id = p_patient and storage_path = p_path) then
    return 0;                                   -- già segnata prima
  end if;
  perform pg_advisory_xact_lock(hashtext('foto_storico:' || p_patient::text));
  select coalesce(max(f.numero), 0) + 1 into v_num from public.foto_storico f where f.patient_id = p_patient;
  insert into public.foto_storico (patient_id, numero, origine, casella, storage_path, scattata_il, sostituita_il)
  values (p_patient, v_num, p_origine, p_casella, p_path, p_scattata, now());
  return 1;
end $$;

revoke all on function public.foto_registra(uuid,text,text,uuid,timestamptz) from public, anon;
revoke all on function public.foto_scheda_imposta(uuid,text,jsonb) from public, anon;
revoke all on function public.foto_segna_sostituita(uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.foto_registra(uuid,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.foto_scheda_imposta(uuid,text,jsonb) to authenticated;
grant execute on function public.foto_segna_sostituita(uuid,text,text,text,timestamptz) to authenticated;

notify pgrst, 'reload schema';

select 'foto-archivio-v1: migration 058 eseguita' as esito;
