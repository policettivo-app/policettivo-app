-- ═══════════════════════════════════════════════════════════════════════
-- Migration 050 — Overhead squat sulla Tavola Policettiva [squat-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `squat_test` — ogni overhead squat misurato sulla tavola: dove va il
--   carico nella discesa, al fondo, nella risalita, ripetizione per ripetizione.
--
-- PERCHE' UNA TABELLA A PARTE (e non dentro oscillazione_test)
--   Lo squat non è una prova ferma: velocità, ellisse e oscillazione non
--   vogliono dire la stessa cosa. Tenendolo separato, lo storico, il confronto,
--   lo schermo del paziente e i PDF dell'Oscillazione restano identici: un test
--   nuovo non può cambiare i numeri di quelli che ci sono già.
--
-- ⚠️ TUTTO ADDITIVO. Una tabella nuova. Non tocca niente di esistente.
--    Si può rilanciare quante volte si vuole.
--    La sessione (test_sessioni, 047) si aggancia SOLO se la 047 c'è.
--
-- Ritorno indietro:
--   drop table if exists public.squat_test;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('squat_test', 'squat-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

create table if not exists public.squat_test (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  patient_id       uuid     references public.patients(id)          on delete cascade,
  sessione_id      uuid,
  quando           timestamptz not null default now(),

  asse             text not null check (asse in ('beccheggio','rollio')),
  momento          text check (momento is null or momento in ('pre','post')),
  piedi            text,
  nota             text,

  ripetizioni      smallint not null default 5,
  ritmo            jsonb,                    -- ms per fase: inizio, giu, fondo, su, piedi
  reazione_ms      smallint,
  durata_reale_s   numeric(6,2),
  campioni         integer,
  hz_reale         numeric(6,2),

  -- verso e zero USATI: senza, fra sei mesi non si sa rispetto a cosa
  verso_beta       smallint,
  verso_gamma      smallint,
  zero_beta        numeric(7,3),
  zero_gamma       numeric(7,3),
  tarato           boolean not null default false,

  -- i numeri, in GRADI della tavola sull'asse del test (+ = destra / avanti)
  inizio           numeric(7,3),             -- in piedi, braccia in alto, prima di scendere
  discesa          numeric(7,3),
  fondo            numeric(7,3),             -- ⭐ la misura di testa
  fondo_sd         numeric(7,3),
  risalita         numeric(7,3),
  secondario_fondo numeric(7,3),             -- l'altro asse, al fondo
  escursione       numeric(7,3),
  coerenza         smallint,                 -- ripetizioni dalla stessa parte del fondo medio

  dettagli         jsonb,                    -- ripetizione per ripetizione, fasi, versione
  traccia          jsonb,                    -- grezza, decimata a 10 Hz
  traccia_hz       smallint not null default 10
);

create index if not exists idx_squat_prof     on public.squat_test (professional_id, quando desc);
create index if not exists idx_squat_paziente on public.squat_test (patient_id, quando desc);
create index if not exists idx_squat_sessione on public.squat_test (sessione_id);

-- la sessione si aggancia solo se la 047 è stata lanciata
do $$
begin
  if exists (select 1 from pg_class where relname = 'test_sessioni')
     and not exists (select 1 from pg_constraint where conname = 'squat_test_sessione_fk') then
    alter table public.squat_test
      add constraint squat_test_sessione_fk foreign key (sessione_id)
      references public.test_sessioni(id) on delete set null;
  end if;
end
$$;

alter table public.squat_test enable row level security;
grant select, insert, update, delete on public.squat_test to authenticated;

drop policy if exists "Professionista legge i suoi squat" on public.squat_test;
create policy "Professionista legge i suoi squat"
on public.squat_test for select
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista salva i suoi squat" on public.squat_test;
create policy "Professionista salva i suoi squat"
on public.squat_test for insert
with check (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
  and (patient_id is null or patient_id in (
    select p.id from public.patients p join public.professionals pr on pr.id = p.professional_id
    where pr.user_id = auth.uid()))
);

drop policy if exists "Professionista annota i suoi squat" on public.squat_test;
create policy "Professionista annota i suoi squat"
on public.squat_test for update
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()))
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista cancella i suoi squat" on public.squat_test;
create policy "Professionista cancella i suoi squat"
on public.squat_test for delete
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));
