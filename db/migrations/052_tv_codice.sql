-- ═══════════════════════════════════════════════════════════════════════
-- Migration 052 — La TV si collega con un CODICE, non con la password [tv-codice-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `tv_dispositivi` — le TV collegate. La TV tiene sul suo browser un segreto
--      lungo e casuale; qui se ne salva solo l'impronta (sha256). Il codice di
--      6 lettere che la TV mostra vale 10 minuti e serve una volta sola.
--   `tv_mostra` — cosa sta mostrando ADESSO il professionista: il paziente e il
--      «pacchetto» di «Prima e dopo» (le stesse righe che il telefono ha già
--      letto, con gli indirizzi delle foto firmati per 2 ore).
--   Sei funzioni: tv_nuovo, tv_stato, tv_pacchetto (le chiama la TV, senza
--   account), tv_conferma, tv_elenco, tv_scollega (le chiama il telefono).
--
-- PERCHE' COSI' (sicurezza)
--   • Sulla TV non si scrive nessuna password e la TV NON entra nell'account:
--     chi smanetta col browser della TV non trova l'archivio.
--   • La TV vede solo il paziente che il telefono sta mostrando, e solo se è
--     stato mostrato nelle ultime 3 ore. Le foto hanno indirizzi che scadono.
--   • Il pacchetto lo scrive il TELEFONO, con le sue regole di sempre (RLS):
--     non si può mettere sulla TV un paziente che non si può già vedere.
--   • Dal telefono si vede l'elenco delle TV e «Scollega» toglie il permesso subito.
--
-- ⚠️ TUTTO ADDITIVO. Due tabelle nuove, sei funzioni. Non tocca niente di
--    esistente. Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   drop function if exists public.tv_nuovo(text), public.tv_stato(text), public.tv_pacchetto(text),
--     public.tv_conferma(text), public.tv_elenco(), public.tv_scollega(uuid);
--   drop table if exists public.tv_mostra; drop table if exists public.tv_dispositivi;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('tv_codice', 'tv-codice-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

create extension if not exists pgcrypto;

create table if not exists public.tv_dispositivi (
  id              uuid primary key default gen_random_uuid(),
  segreto_hash    text not null unique,
  codice          text unique,
  codice_scade    timestamptz,
  professional_id uuid references public.professionals(id) on delete cascade,
  nome            text not null default 'TV',
  creato_il       timestamptz not null default now(),
  confermato_il   timestamptz,
  ultimo_uso      timestamptz
);
create index if not exists idx_tv_disp_prof on public.tv_dispositivi (professional_id);
alter table public.tv_dispositivi enable row level security;
-- nessuna policy: si passa SOLO dalle funzioni qui sotto

create table if not exists public.tv_mostra (
  professional_id uuid primary key references public.professionals(id) on delete cascade,
  patient_id      uuid references public.patients(id) on delete cascade,
  pacchetto       jsonb,
  aggiornato_il   timestamptz not null default now()
);
alter table public.tv_mostra enable row level security;
grant select, insert, update, delete on public.tv_mostra to authenticated;

-- il professionista scrive solo la SUA riga, e solo con un paziente che vede già
drop policy if exists "Professionista vede cosa mostra" on public.tv_mostra;
create policy "Professionista vede cosa mostra" on public.tv_mostra for select to authenticated
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));
drop policy if exists "Professionista sceglie cosa mostrare" on public.tv_mostra;
create policy "Professionista sceglie cosa mostrare" on public.tv_mostra for insert to authenticated
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
  and (patient_id is null or patient_id in (select p.id from public.patients p)));
drop policy if exists "Professionista cambia cosa mostra" on public.tv_mostra;
create policy "Professionista cambia cosa mostra" on public.tv_mostra for update to authenticated
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()))
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
  and (patient_id is null or patient_id in (select p.id from public.patients p)));

-- ─── la TV, senza account ──────────────────────────────────────────────
-- Nuovo codice per questa TV (il segreto lo genera la TV e non lascia mai il suo browser)
create or replace function public.tv_nuovo(p_segreto text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_cod text; v_alfa text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; tent int := 0;
begin
  if p_segreto is null or length(p_segreto) < 32 then return null; end if;
  v_hash := encode(digest(p_segreto, 'sha256'), 'hex');
  -- pulizia: i codici mai confermati e scaduti da più di un'ora se ne vanno
  delete from public.tv_dispositivi where professional_id is null and codice_scade < now() - interval '1 hour';
  loop
    v_cod := '';
    for i in 1..6 loop v_cod := v_cod || substr(v_alfa, 1 + floor(random() * length(v_alfa))::int, 1); end loop;
    exit when not exists (select 1 from public.tv_dispositivi where codice = v_cod);
    tent := tent + 1; if tent > 20 then return null; end if;
  end loop;
  insert into public.tv_dispositivi (segreto_hash, codice, codice_scade)
  values (v_hash, v_cod, now() + interval '10 minutes')
  on conflict (segreto_hash) do update
    set codice = case when public.tv_dispositivi.professional_id is null then excluded.codice else null end,
        codice_scade = case when public.tv_dispositivi.professional_id is null then excluded.codice_scade else null end;
  return (select case when professional_id is null then codice else null end from public.tv_dispositivi where segreto_hash = v_hash);
end $$;

-- A chi è collegata questa TV, e su quali canali ascolta
create or replace function public.tv_stato(p_segreto text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_d public.tv_dispositivi; v_can uuid; v_live uuid; v_live_at timestamptz;
begin
  if p_segreto is null or length(p_segreto) < 32 then return jsonb_build_object('collegata', false); end if;
  select * into v_d from public.tv_dispositivi where segreto_hash = encode(digest(p_segreto, 'sha256'), 'hex');
  if v_d.id is null or v_d.professional_id is null then return jsonb_build_object('collegata', false); end if;
  -- la TV chiede ogni pochi secondi: l'ora dell'ultimo uso si scrive al massimo ogni 5 minuti
  update public.tv_dispositivi set ultimo_uso = now() where id = v_d.id and (ultimo_uso is null or ultimo_uso < now() - interval '5 minutes');
  select schermo_canale, live_canale, live_canale_at into v_can, v_live, v_live_at
    from public.professionals where id = v_d.professional_id;
  if v_can is null then
    v_can := gen_random_uuid();
    update public.professionals set schermo_canale = v_can where id = v_d.professional_id;
  end if;
  return jsonb_build_object('collegata', true, 'nome', v_d.nome, 'schermo', v_can,
    'oscillazione', case when v_live_at > now() - interval '12 hours' then v_live else null end);
end $$;

-- Il pacchetto del paziente che si sta mostrando (solo se mostrato nelle ultime 3 ore)
create or replace function public.tv_pacchetto(p_segreto text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_prof uuid; v_m public.tv_mostra;
begin
  if p_segreto is null or length(p_segreto) < 32 then return null; end if;
  select professional_id into v_prof from public.tv_dispositivi
   where segreto_hash = encode(digest(p_segreto, 'sha256'), 'hex') and professional_id is not null;
  if v_prof is null then return null; end if;
  select * into v_m from public.tv_mostra where professional_id = v_prof;
  if v_m.patient_id is null or v_m.aggiornato_il < now() - interval '3 hours' then return null; end if;
  return v_m.pacchetto;
end $$;

-- ─── il telefono, col suo account ──────────────────────────────────────
create or replace function public.tv_conferma(p_codice text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_prof uuid; v_id uuid;
begin
  select pr.id into v_prof from public.professionals pr where pr.user_id = auth.uid() limit 1;
  if v_prof is null then return false; end if;
  select id into v_id from public.tv_dispositivi
   where codice = upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g'))
     and professional_id is null and codice_scade > now();
  if v_id is null then return false; end if;
  update public.tv_dispositivi set professional_id = v_prof, codice = null, codice_scade = null, confermato_il = now()
   where id = v_id;
  return true;
end $$;

create or replace function public.tv_elenco()
returns table (id uuid, nome text, confermato_il timestamptz, ultimo_uso timestamptz)
language sql security definer set search_path = public as $$
  select d.id, d.nome, d.confermato_il, d.ultimo_uso from public.tv_dispositivi d
   where d.professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
   order by d.confermato_il desc
$$;

create or replace function public.tv_scollega(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.tv_dispositivi
   where id = p_id and professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.tv_nuovo(text), public.tv_stato(text), public.tv_pacchetto(text),
  public.tv_conferma(text), public.tv_elenco(), public.tv_scollega(uuid) from public;
grant execute on function public.tv_nuovo(text), public.tv_stato(text), public.tv_pacchetto(text) to anon, authenticated;
grant execute on function public.tv_conferma(text), public.tv_elenco(), public.tv_scollega(uuid) to authenticated;
