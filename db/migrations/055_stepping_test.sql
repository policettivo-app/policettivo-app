-- ═══════════════════════════════════════════════════════════════════════
-- Migration 055 — Stepping test (Fukuda) col telefono [stepping-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `stepping_test` — 50 passi sul posto a occhi chiusi e braccia tese, col
--   telefono in mano: di quanti gradi il corpo ruota (giroscopio). Una riga
--   per misura, con le singole prove in `prove`; dalle prove ripetute si
--   ricava l'errore della misura (2,77 × deviazione standard fra le prove).
--
-- PERCHE' COSI'
--   È un'OSSERVAZIONE, non un test diagnostico: in letteratura la sua
--   accuratezza è bassa e nei sani la rotazione varia molto. Qui si salvano
--   gradi e direzione, nessun giudizio.
--
-- ⚠️ TUTTO ADDITIVO. Una tabella nuova, con le stesse regole di squat e ATR:
--    ognuno vede e scrive solo le sue misure e i suoi pazienti.
--    Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   drop table if exists public.stepping_test;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('stepping_test', 'stepping-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

create table if not exists public.stepping_test (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  patient_id       uuid     references public.patients(id)          on delete cascade,
  sessione_id      uuid,
  quando           timestamptz not null default now(),
  momento          text check (momento is null or momento in ('pre','post')),
  nota             text,

  passi            smallint not null default 50,   -- passi del protocollo (metronomo)
  ritmo_bpm        smallint,                       -- passi al minuto
  -- gradi di rotazione alla fine, media delle prove; + = verso DESTRA, − = verso SINISTRA
  rotazione        numeric(6,1),
  n_prove          smallint not null default 1,
  errore           numeric(6,1),                   -- 2,77 × deviazione standard fra le prove (null con una prova sola)
  prove            jsonb,                          -- [{rotazione, passi_rilevati, durata_s, deriva, serie}, ...]

  scala            numeric(8,4),                   -- unità del giroscopio (1 = gradi, 57,2958 = radianti)
  verso            smallint,                       -- +1 / −1 dalla taratura
  tarato           boolean not null default false,
  dettagli         jsonb
);

create index if not exists idx_stepping_prof     on public.stepping_test (professional_id, quando desc);
create index if not exists idx_stepping_paziente on public.stepping_test (patient_id, quando desc);

do $$
begin
  if exists (select 1 from pg_class where relname = 'test_sessioni')
     and not exists (select 1 from pg_constraint where conname = 'stepping_test_sessione_fk') then
    alter table public.stepping_test
      add constraint stepping_test_sessione_fk foreign key (sessione_id)
      references public.test_sessioni(id) on delete set null;
  end if;
end
$$;

alter table public.stepping_test enable row level security;
grant select, insert, update, delete on public.stepping_test to authenticated;

drop policy if exists "Professionista legge i suoi stepping" on public.stepping_test;
create policy "Professionista legge i suoi stepping"
on public.stepping_test for select
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista salva i suoi stepping" on public.stepping_test;
create policy "Professionista salva i suoi stepping"
on public.stepping_test for insert
with check (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
  and (patient_id is null or patient_id in (
    select p.id from public.patients p join public.professionals pr on pr.id = p.professional_id
    where pr.user_id = auth.uid()))
);

drop policy if exists "Professionista annota i suoi stepping" on public.stepping_test;
create policy "Professionista annota i suoi stepping"
on public.stepping_test for update
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()))
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista cancella i suoi stepping" on public.stepping_test;
create policy "Professionista cancella i suoi stepping"
on public.stepping_test for delete
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));
