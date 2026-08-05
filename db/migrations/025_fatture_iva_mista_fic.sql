-- 025_fatture_iva_mista_fic.sql
-- Blocco 2B + IVA mista (agosto 2026)
-- Idempotente: si puo' rieseguire senza danni.
--
-- Aggiunge alla tabella `fatture`:
--   * riepilogo_iva  jsonb   -> castelletto IVA per aliquota (righe con {code,label,rate,natura,imponibile,iva})
--   * colonne FIC (Fatture in Cloud) per il Blocco 2B (invio fattura)
--
-- NOTA numerazione: quando il professionista e' collegato a FIC, il numero
-- ufficiale della fattura lo assegna FIC e viene salvato in `fic_numero`.
-- `numero`/`progressivo` restano la numerazione interna/di riserva (usata
-- quando NON si e' collegati a FIC).

alter table public.fatture add column if not exists riepilogo_iva jsonb;

alter table public.fatture add column if not exists fic_document_id text;   -- id del documento su FIC
alter table public.fatture add column if not exists fic_number     integer; -- numero progressivo assegnato da FIC
alter table public.fatture add column if not exists fic_numeration text;    -- sezionale FIC (es. "" o "/fatt")
alter table public.fatture add column if not exists fic_numero     text;    -- numero ufficiale FIC gia' formattato (es. "2026/12")
alter table public.fatture add column if not exists fic_sent_at    timestamptz;

comment on column public.fatture.riepilogo_iva is 'Castelletto IVA per aliquota: [{code,label,rate,natura,imponibile,iva}]';
comment on column public.fatture.fic_numero    is 'Numero ufficiale assegnato da Fatture in Cloud (fonte di numerazione quando collegati)';
