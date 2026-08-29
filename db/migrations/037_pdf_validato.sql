-- Migration 037: PDF validato dal professionista + archivio
-- pdf-validato-v1 · 29 agosto 2026
--
-- Perche':
--  * il PDF porta la firma del professionista, quindi serve tracciare QUANDO
--    lui ha dichiarato di averlo letto e validato;
--  * la relazione AI puo' invecchiare (si annotano foto dopo averla generata):
--    serve sapere quando e' stata prodotta per poterlo dire in faccia;
--  * il bucket clinical-docs e' PRIVATO, quindi il link pubblico salvato in
--    pdf_url non basta ad aprire il file: serve il percorso, da firmare al
--    momento dell'apertura.
--
-- Sicura da eseguire due volte: ADD COLUMN IF NOT EXISTS, nessun default,
-- nessun vincolo, nessun dato toccato.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS relazione_ai_generata_il timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_validato_il          timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_storage_path         text;

COMMENT ON COLUMN public.visits.relazione_ai_generata_il IS
  'Quando e stata generata relazione_ai. Se le annotazioni delle foto sono piu recenti, la relazione e invecchiata e l app lo segnala prima del PDF.';
COMMENT ON COLUMN public.visits.pdf_validato_il IS
  'Quando il professionista ha spuntato "ho letto e validato" e il PDF e stato archiviato. NULL = nessun PDF validato.';
COMMENT ON COLUMN public.visits.pdf_storage_path IS
  'Percorso del PDF dentro il bucket privato clinical-docs (pdf-reports/{prof_id}/{visit_id}.pdf). Si apre con una signed URL.';

-- Verifica finale: devono uscire 3 righe.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'visits'
  AND column_name IN ('relazione_ai_generata_il', 'pdf_validato_il', 'pdf_storage_path')
ORDER BY column_name;
