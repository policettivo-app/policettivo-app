-- 028_noleggi.sql  (idempotente — si puo' rieseguire senza danni)
-- Modulo NOLEGGI & VENDITE (Policettivo, agosto 2026)
--
-- Modello:
--   * `noleggi`           = il fatto (cosa e' stato dato al paziente, quando, a che prezzo, quando rientra)
--   * `noleggi_addebiti`  = le righe a valore (quello che entra nel conto e in fattura)
--
-- Perche' due tabelle: un noleggio "una tantum" genera 1 addebito; un noleggio
-- a "canone mensile" ne genera 1 al mese. Gli addebiti si comportano come le
-- `therapy_sessions` (venduto datato) -> il modello di cassa resta invariato:
-- i soldi entrano SOLO da `patient_payments`, la fattura si aggancia all'incasso.
--
-- Scoping: professional_id = auth.uid() DIRETTO, come `fatture` e `rimborso_*`.
-- (Lezione #17: NON e' il pattern subquery-su-professionals delle tabelle vecchie.)
--
-- IVA: `iva_code` per riga, stessi codici di fattura.html (IVA_TIPI):
--   ESENTE10 | FORF | IVA22 | IVA10 | IVA5 | IVA4 ; NULL = usa il default del professionista.
-- Noleggi e vendite di beni sono soggetti a IVA anche per il professionista
-- sanitario (le terapie restano esenti art.10) -> fattura a IVA mista, gia'
-- supportata da fattura.html (marker iva-mista-v1).

create extension if not exists pgcrypto;

-- ── Tabella principale: il noleggio / la vendita ─────────────────────
create table if not exists public.noleggi (
  id                 uuid primary key default gen_random_uuid(),
  professional_id    uuid not null default auth.uid(),
  patient_id         uuid references public.patients(id) on delete set null,

  tipo               text not null default 'noleggio',    -- 'noleggio' | 'vendita'
  codice             text,                                -- codice voce di catalogo (snapshot)
  descrizione        text not null,                       -- snapshot: resta valido anche se il catalogo cambia
  quantita           numeric not null default 1,

  modalita           text not null default 'una_tantum',  -- 'una_tantum' | 'canone_mensile'
  prezzo             numeric not null default 0,          -- editabile al momento, ANCHE 0 (regalato/incluso)
  iva_code           text,                                -- NULL = default del professionista

  data_inizio        date not null default current_date,
  data_fine_prevista date,                                -- rientro previsto (solo noleggi)
  data_restituzione  date,                                -- rientro effettivo
  stato              text not null default 'attivo',      -- 'attivo' | 'restituito' | 'chiuso'

  note               text,
  created_at         timestamptz not null default now()
);

-- ── Righe a valore generate dal noleggio ────────────────────────────
create table if not exists public.noleggi_addebiti (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid(),
  noleggio_id     uuid not null references public.noleggi(id) on delete cascade,
  patient_id      uuid references public.patients(id) on delete set null,

  periodo         date not null,          -- una tantum: data_inizio; canone: 1o giorno del mese addebitato
  descrizione     text not null,
  importo         numeric not null default 0,
  iva_code        text,

  created_at      timestamptz not null default now()
);

-- Chiave anti-doppione: la generazione dei canoni gira LATO CLIENT (niente cron,
-- vincolo 12/12 serverless) e puo' ripetersi a ogni apertura pagina. Questo indice
-- rende la generazione idempotente: upsert con ignoreDuplicates.
create unique index if not exists uq_noleggi_addebiti_periodo
  on public.noleggi_addebiti(noleggio_id, periodo);

create index if not exists idx_noleggi_prof_stato    on public.noleggi(professional_id, stato);
create index if not exists idx_noleggi_paziente      on public.noleggi(patient_id);
create index if not exists idx_noleggi_scadenza      on public.noleggi(professional_id, data_fine_prevista);
create index if not exists idx_addebiti_prof_periodo on public.noleggi_addebiti(professional_id, periodo);
create index if not exists idx_addebiti_paziente     on public.noleggi_addebiti(patient_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.noleggi          enable row level security;
alter table public.noleggi_addebiti enable row level security;

drop policy if exists noleggi_owner on public.noleggi;
create policy noleggi_owner on public.noleggi
  for all using (professional_id = auth.uid()) with check (professional_id = auth.uid());

drop policy if exists noleggi_addebiti_owner on public.noleggi_addebiti;
create policy noleggi_addebiti_owner on public.noleggi_addebiti
  for all using (professional_id = auth.uid()) with check (professional_id = auth.uid());

comment on table  public.noleggi                   is 'Noleggi e vendite di prodotti al paziente (il fatto). Le righe a valore stanno in noleggi_addebiti.';
comment on table  public.noleggi_addebiti          is 'Righe a valore generate da un noleggio/vendita: 1 per una tantum, 1 al mese per canone. Entrano nel conto del paziente come le sedute.';
comment on column public.noleggi.prezzo            is 'Prezzo applicato, sempre modificabile e anche 0 (scontato/regalato/incluso nel percorso). A 0 la riga resta come storico ma non genera importo ne IVA.';
comment on column public.noleggi.iva_code          is 'Codice IVA della riga (ESENTE10/FORF/IVA22/IVA10/IVA5/IVA4). NULL = default del professionista.';
comment on column public.noleggi_addebiti.periodo  is 'Una tantum: data_inizio. Canone mensile: primo giorno del mese addebitato. UNIQUE con noleggio_id.';
