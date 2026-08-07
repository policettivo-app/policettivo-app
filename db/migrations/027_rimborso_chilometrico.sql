-- 027_rimborso_chilometrico.sql  (idempotente)
-- Modulo rimborso chilometrico per dipendenti/operatori.
-- Scoping: owner_user_id = admin che gestisce (auth.uid diretto, come le fatture).
-- Predisposto per DELEGA (operatore_user_id) e per DISTANZA AUTOMATICA (partenza/arrivo).

create extension if not exists pgcrypto;

-- Operatori / dipendenti da rimborsare (lista separata, anche senza account app)
create table if not exists public.rimborso_operatori (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default auth.uid(),
  operatore_user_id uuid,                       -- opzionale: auth.uid se l'operatore ha un account (delega)
  nome              text not null,
  cognome           text,
  email             text,
  -- veicolo (uno per operatore in questa versione)
  veicolo           text,                        -- es. "Fiat Panda 1.2 benzina"
  targa             text,
  alimentazione     text,                        -- benzina/diesel/gpl/metano/ibrido/elettrico
  cavalli_fiscali   numeric,                     -- per avviso deducibilita' (17CV benzina / 20CV diesel)
  tariffa_km        numeric not null default 0,  -- EUR/km da tabella ACI (aggiornata a mano)
  tariffa_anno      integer,                     -- anno di validita' della tariffa ACI
  attivo            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Tragitti ricorrenti (template per autocompilazione "due clic")
create table if not exists public.rimborso_tragitti (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  descrizione   text not null,                  -- es. "Studio -> Domicilio Rossi"
  partenza      text,
  arrivo        text,
  km            numeric not null default 0,
  tipo          text not null default 'lavoro', -- 'lavoro' | 'casa_lavoro'
  created_at    timestamptz not null default now()
);

-- Trasferte effettive
create table if not exists public.rimborso_trasferte (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default auth.uid(),
  operatore_id   uuid not null references public.rimborso_operatori(id) on delete restrict,
  tragitto_id    uuid references public.rimborso_tragitti(id) on delete set null,
  data           date not null default current_date,
  descrizione    text,
  partenza       text,
  arrivo         text,
  km             numeric not null default 0,     -- km di una tratta
  andata_ritorno boolean not null default false, -- se true, km totali = km * 2
  km_totali      numeric not null default 0,     -- km effettivi conteggiati
  tipo           text not null default 'lavoro', -- 'lavoro' | 'casa_lavoro'
  tariffa_km     numeric not null default 0,     -- snapshot della tariffa al momento
  importo        numeric not null default 0,     -- km_totali * tariffa_km
  stato          text not null default 'registrata',
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_rimborso_trasferte_data on public.rimborso_trasferte(owner_user_id, data);
create index if not exists idx_rimborso_veicoli_op on public.rimborso_trasferte(operatore_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.rimborso_operatori enable row level security;
alter table public.rimborso_tragitti  enable row level security;
alter table public.rimborso_trasferte enable row level security;

-- Proprietario (amministrazione): accesso completo ai propri dati
drop policy if exists rimborso_operatori_owner on public.rimborso_operatori;
create policy rimborso_operatori_owner on public.rimborso_operatori
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists rimborso_tragitti_owner on public.rimborso_tragitti;
create policy rimborso_tragitti_owner on public.rimborso_tragitti
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists rimborso_trasferte_owner on public.rimborso_trasferte;
create policy rimborso_trasferte_owner on public.rimborso_trasferte
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Delega: l'operatore con account vede la propria anagrafica e gestisce le proprie trasferte
drop policy if exists rimborso_operatori_self on public.rimborso_operatori;
create policy rimborso_operatori_self on public.rimborso_operatori
  for select using (operatore_user_id = auth.uid());

drop policy if exists rimborso_trasferte_self on public.rimborso_trasferte;
create policy rimborso_trasferte_self on public.rimborso_trasferte
  for all
  using (operatore_id in (select id from public.rimborso_operatori where operatore_user_id = auth.uid()))
  with check (operatore_id in (select id from public.rimborso_operatori where operatore_user_id = auth.uid()));
