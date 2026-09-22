-- ═══════════════════════════════════════════════════════════════════════
-- Migration 047 — Sessioni test [test-sessioni-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   1. `test_sessioni` — una riga per ogni sessione di test: di chi (paziente
--      oppure prova libera con nome, età e peso facoltativi) e quando.
--   2. `oscillazione_test.sessione_id` — ogni prova sta dentro una sessione.
--
-- PERCHÉ UNA TABELLA A PARTE (decisione 1=A, 22 set 2026)
--   Nome, età e peso si scrivono UNA volta per sessione, non su ogni prova.
--   E la sessione è il contenitore di tutti i test: oggi l'Oscillazione,
--   domani gli altri. Per questo si chiama `test_sessioni` e non
--   `oscillazione_sessioni`.
--
-- ⚠️ TUTTO ADDITIVO. Non cancella niente, non tocca colonne esistenti.
--    Le prove già salvate restano con sessione_id vuoto: lo storico le
--    raggruppa per giorno. Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   alter table public.oscillazione_test drop column if exists sessione_id;
--   drop table if exists public.test_sessioni;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('test_sessioni', 'test-sessioni-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

create table if not exists public.test_sessioni (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  patient_id       uuid     references public.patients(id)          on delete cascade,
  quando           timestamptz not null default now(),
  -- solo per le prove libere, tutti facoltativi: servono a sapere di chi è il test
  nome             text,
  eta              smallint     check (eta is null or (eta between 0 and 120)),
  peso_kg          numeric(5,1) check (peso_kg is null or (peso_kg between 1 and 400)),
  note             text
);

create index if not exists idx_test_sessioni_prof     on public.test_sessioni (professional_id, quando desc);
create index if not exists idx_test_sessioni_paziente on public.test_sessioni (patient_id, quando desc);

alter table public.test_sessioni enable row level security;

drop policy if exists "Professionista legge le sue sessioni" on public.test_sessioni;
create policy "Professionista legge le sue sessioni"
on public.test_sessioni for select
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista crea le sue sessioni" on public.test_sessioni;
create policy "Professionista crea le sue sessioni"
on public.test_sessioni for insert
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

-- si corregge nome, età e peso a sessione già aperta
drop policy if exists "Professionista corregge le sue sessioni" on public.test_sessioni;
create policy "Professionista corregge le sue sessioni"
on public.test_sessioni for update
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()))
with check (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

drop policy if exists "Professionista cancella le sue sessioni" on public.test_sessioni;
create policy "Professionista cancella le sue sessioni"
on public.test_sessioni for delete
using (professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid()));

-- ogni prova dentro la sua sessione. Cancellando una sessione le prove NON
-- se ne vanno: restano senza sessione (le misure sono il dato).
alter table public.oscillazione_test
  add column if not exists sessione_id uuid references public.test_sessioni(id) on delete set null;
create index if not exists idx_osc_test_sessione on public.oscillazione_test (sessione_id);
