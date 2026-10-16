-- ═══════════════════════════════════════════════════════════════════════
-- Migration 059 — Scheda di allenamento semplice (IN PROVA) [scheda-v1]
-- ═══════════════════════════════════════════════════════════════════════
-- COSA AGGIUNGE (piano: claude/PIANO-scheda-allenamento.md)
--   • scheda_allenamento        → una scheda: di un paziente, oppure un
--                                 MODELLO dello studio (paziente vuoto).
--                                 «Ripeti tutta la scheda» (1 di partenza),
--                                 recupero fra esercizi (30 s), ritmo (3 s).
--   • scheda_allenamento_righe  → l'elenco: riga ESERCIZIO o riga NOTA.
--                                 Esercizio A TEMPO (secondi) oppure A
--                                 RIPETIZIONI; serie; quando (sempre /
--                                 mattina / sera); nota; «guidato col sensore».
--                                 Il NOME si copia sulla riga: se un esercizio
--                                 si toglie dalla libreria la scheda non si
--                                 rompe e la libreria si cancella come oggi.
-- 🧪 IN PROVA: visibile_paziente = false di partenza, nessun permesso ad
--    anon, nessuna RPC dei pazienti toccata. Il paziente NON la vede.
-- ⚠️ TUTTO ADDITIVO: nessuna tabella, colonna, funzione o policy esistente
--    viene toccata o tolta. Si può rilanciare quante volte si vuole.
--    Regole = quelle di foto_storico (can_access_patient / can_edit_patient);
--    i modelli = quelle della libreria esercizi (my_studio_id()).
--    La scheda NON si cancella (solo stato «archiviata»); le righe sì,
--    perché l'editor le riscrive.
-- Ritorno indietro (nessuna pagina di oggi usa queste tabelle):
--   drop table if exists public.scheda_allenamento_righe;
--   drop table if exists public.scheda_allenamento;
--   drop function if exists public.scheda_puo(uuid, boolean);
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.scheda_allenamento (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid references public.patients(id) on delete cascade,
  studio_id          uuid,                                   -- solo per i modelli
  nome               text,
  ripeti_volte       integer not null default 1,
  recupero_sec       integer not null default 30,
  ritmo_sec          numeric(4,1) not null default 3,
  stato              text not null default 'prova',
  visibile_paziente  boolean not null default false,
  creato_il          timestamptz not null default now(),
  creato_da          uuid default auth.uid(),
  aggiornato_il      timestamptz not null default now(),
  constraint scheda_di_chi     check ((patient_id is not null and studio_id is null)
                                   or (patient_id is null and studio_id is not null)),
  constraint scheda_ripeti_ok  check (ripeti_volte between 1 and 20),
  constraint scheda_recupero_ok check (recupero_sec between 0 and 600),
  constraint scheda_ritmo_ok   check (ritmo_sec between 1 and 20),
  constraint scheda_stato_ok   check (stato in ('prova','attiva','archiviata'))
);
create index if not exists scheda_allenamento_paziente on public.scheda_allenamento (patient_id);
create index if not exists scheda_allenamento_studio   on public.scheda_allenamento (studio_id);

create table if not exists public.scheda_allenamento_righe (
  id               uuid primary key default gen_random_uuid(),
  scheda_id        uuid not null references public.scheda_allenamento(id) on delete cascade,
  ordine           integer not null,
  tipo             text not null default 'esercizio',
  exercise_id      uuid references public.exercises(id) on delete set null,
  video_id         uuid references public.exercise_videos(id) on delete set null,
  elicoidale_id    text,
  nome             text,                 -- nome mostrato al paziente (copiato dalla
                                         -- libreria): resta anche se l'esercizio
                                         -- viene tolto dalla libreria
  misura           text,                 -- 'tempo' | 'ripetizioni' (solo esercizi)
  secondi          integer,
  ripetizioni      integer,
  serie            integer not null default 1,
  quando           text not null default 'sempre',
  ritmo_sec        numeric(4,1),         -- vuoto = quello della scheda
  recupero_sec     integer,              -- vuoto = quello della scheda
  guidato_sensore  boolean not null default false,
  testo            text,                 -- la nota (riga nota) o la frase per il paziente
  creato_il        timestamptz not null default now(),
  constraint riga_ordine_unico unique (scheda_id, ordine) deferrable initially deferred,
  constraint riga_tipo_ok     check (tipo in ('esercizio','nota')),
  constraint riga_quando_ok   check (quando in ('sempre','mattina','sera')),
  constraint riga_serie_ok    check (serie between 1 and 20),
  constraint riga_ritmo_ok    check (ritmo_sec is null or ritmo_sec between 1 and 20),
  constraint riga_recupero_ok check (recupero_sec is null or recupero_sec between 0 and 600),
  constraint riga_nota_ok     check (tipo <> 'nota' or nullif(btrim(testo), '') is not null),
  constraint riga_esercizio_ok check (tipo <> 'esercizio' or coalesce(
        nullif(btrim(nome), '') is not null
    and (   (misura = 'tempo'       and secondi between 1 and 3600 and ripetizioni is null)
         or (misura = 'ripetizioni' and ripetizioni between 1 and 500 and secondi is null)), false))
);
create index if not exists scheda_righe_scheda on public.scheda_allenamento_righe (scheda_id, ordine);

alter table public.scheda_allenamento       enable row level security;
alter table public.scheda_allenamento_righe enable row level security;
revoke all on public.scheda_allenamento       from anon;
revoke all on public.scheda_allenamento_righe from anon;
grant select, insert, update         on public.scheda_allenamento       to authenticated;
grant select, insert, update, delete on public.scheda_allenamento_righe to authenticated;

-- Chi può leggere / scrivere una scheda (una regola sola, usata da tutte e due le tabelle).
create or replace function public.scheda_puo(p_scheda uuid, p_scrivere boolean)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.scheda_allenamento s
     where s.id = p_scheda
       and case when s.patient_id is not null
                then case when p_scrivere then public.can_edit_patient(s.patient_id)
                          else public.can_access_patient(s.patient_id) end
                else s.studio_id = public.my_studio_id() end)
$$;
revoke all on function public.scheda_puo(uuid, boolean) from public, anon;
grant execute on function public.scheda_puo(uuid, boolean) to authenticated;

drop policy if exists scheda_select on public.scheda_allenamento;
create policy scheda_select on public.scheda_allenamento for select
  using (case when patient_id is not null then public.can_access_patient(patient_id)
              else studio_id = public.my_studio_id() end);
drop policy if exists scheda_insert on public.scheda_allenamento;
create policy scheda_insert on public.scheda_allenamento for insert
  with check (case when patient_id is not null then public.can_edit_patient(patient_id)
                   else studio_id = public.my_studio_id() end);
drop policy if exists scheda_update on public.scheda_allenamento;
create policy scheda_update on public.scheda_allenamento for update
  using      (case when patient_id is not null then public.can_edit_patient(patient_id)
                   else studio_id = public.my_studio_id() end)
  with check (case when patient_id is not null then public.can_edit_patient(patient_id)
                   else studio_id = public.my_studio_id() end);

drop policy if exists scheda_righe_select on public.scheda_allenamento_righe;
create policy scheda_righe_select on public.scheda_allenamento_righe for select
  using (public.scheda_puo(scheda_id, false));
drop policy if exists scheda_righe_insert on public.scheda_allenamento_righe;
create policy scheda_righe_insert on public.scheda_allenamento_righe for insert
  with check (public.scheda_puo(scheda_id, true));
drop policy if exists scheda_righe_update on public.scheda_allenamento_righe;
create policy scheda_righe_update on public.scheda_allenamento_righe for update
  using (public.scheda_puo(scheda_id, true)) with check (public.scheda_puo(scheda_id, true));
drop policy if exists scheda_righe_delete on public.scheda_allenamento_righe;
create policy scheda_righe_delete on public.scheda_allenamento_righe for delete
  using (public.scheda_puo(scheda_id, true));

notify pgrst, 'reload schema';

select 'scheda-v1: migration 059 eseguita' as esito;
