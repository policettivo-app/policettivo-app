-- accetta-termini-v1 — 064_accettazione_termini.sql
-- Registra quando ogni professionista accetta Termini di servizio, DPA (art. 28)
-- e Privacy, con la versione dei testi. Una riga per persona e per versione.
-- Tabella NUOVA: non sostituisce nulla, si puo' lanciare due volte.
-- Per tornare indietro: drop table public.accettazioni_termini;

create table if not exists public.accettazioni_termini (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  versione      text not null,
  accettato_at  timestamptz not null default now(),
  user_agent    text,
  unique (user_id, versione)
);

alter table public.accettazioni_termini enable row level security;

drop policy if exists accettazioni_select_own on public.accettazioni_termini;
create policy accettazioni_select_own on public.accettazioni_termini
  for select to authenticated using (user_id = auth.uid());

drop policy if exists accettazioni_insert_own on public.accettazioni_termini;
create policy accettazioni_insert_own on public.accettazioni_termini
  for insert to authenticated with check (user_id = auth.uid());

-- Nessuna policy di update o delete: un'accettazione non si modifica e non si cancella.
