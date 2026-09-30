-- ═══════════════════════════════════════════════════════════════════════
-- Migration 054 — ATR: la rotazione del tronco col telefono [atr-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `atr_test` — una misura dell'ATR (Angle of Trunk Rotation) nel test di
--   Adam: il telefono di traverso sulla schiena, quattro livelli, tre passate.
--   Per ogni livello il valore medio con il SEGNO (+ = più alto a DESTRA,
--   − = più alto a SINISTRA) e, in `passate`, i singoli valori: da quelli si
--   ricava l'errore della misura (2,77 × deviazione standard entro il livello).
--
-- PERCHE' COSI'
--   È uno screening, NON una diagnosi: qui si salvano gradi, non giudizi.
--   Le fasce (5° · 7°) le mostra la pagina al professionista, con le fonti.
--
-- ⚠️ TUTTO ADDITIVO. Una tabella nuova, con le stesse regole dello squat (050):
--    ognuno vede e scrive solo le sue misure e i suoi pazienti.
--    Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   drop table if exists public.atr_test;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('atr_test', 'atr-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

create table if not exists public.atr_test (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  patient_id       uuid     references public.patients(id)          on delete cascade,
  sessione_id      uuid,
  quando           timestamptz not null default now(),
  momento          text check (momento is null or momento in ('pre','post')),
  nota             text,

  -- gradi, media delle passate; + = più alto a destra, − = più alto a sinistra
  toracico_alto    numeric(5,2),
  toracico         numeric(5,2),
  toracolombare    numeric(5,2),
  lombare          numeric(5,2),
  massimo          numeric(5,2),            -- il valore assoluto più alto fra i livelli
  livello_massimo  text,

  n_passate        smallint not null default 1,
  errore           numeric(5,2),            -- 2,77 × Sw dalle passate (null con una passata sola)
  passate          jsonb,                   -- [{toracico_alto: .., toracico: .., ...}, ...]

  zero             numeric(6,3),            -- la correzione del telefono usata (taratura)
  verso            smallint,                -- +1 / −1: il lato della punta del telefono
  tarato           boolean not null default false,
  dettagli         jsonb
);

create index if not exists idx_atr_prof     on public.atr_test (professional_id, quando desc);
create index if not exists idx_atr_paziente on public.atr_test (patient_id, quando desc);

do $$
begin
  if exists (select 1 from pg_class where relname = 'test_sessioni')
     and not exists (select 1 from pg_constraint where conname = 'atr_test_sessione_fk') then
    alter table public.atr_test
      add constraint atr_test_sessione_fk foreign key (sessione_id)
      references public.test_sessioni(id) on delete set null;
  end if;
end
$$;

alter table public.atr_test enable row level security;
grant select, insert, update, delete on public.atr_test to authenticated;

drop policy if exists "Professionista legge i suoi ATR" on public.atr_test;
create policy "Professionista legge i suoi ATR"
on public.atr_test for select
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista salva i suoi ATR" on public.atr_test;
create policy "Professionista salva i suoi ATR"
on public.atr_test for insert
with check (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
  and (patient_id is null or patient_id in (
    select p.id from public.patients p join public.professionals pr on pr.id = p.professional_id
    where pr.user_id = auth.uid()))
);

drop policy if exists "Professionista annota i suoi ATR" on public.atr_test;
create policy "Professionista annota i suoi ATR"
on public.atr_test for update
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()))
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista cancella i suoi ATR" on public.atr_test;
create policy "Professionista cancella i suoi ATR"
on public.atr_test for delete
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));
