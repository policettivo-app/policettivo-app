-- Migration 039: che TIPO di documento e' una nota clinica
-- progetto-terapeutico-v1 · 1 settembre 2026
--
-- PERCHE'.
-- In clinical_notes finiscono cose diverse fra loro: la relazione clinica che
-- il professionista scrive a mano, le sintesi generate dall'AI e — da oggi —
-- il progetto terapeutico. Finora si distinguevano guardando dentro il TESTO:
--     content LIKE '[SINTESI_AI_V1]%'
-- Un prefisso dentro il contenuto non e' un tipo: basta che qualcuno incolli
-- quella stringa in una nota e la nota cambia natura. E ogni documento nuovo
-- sarebbe stato un altro prefisso e un altro filtro fragile. Qui il tipo
-- diventa una colonna.
--
-- I QUATTRO VALORI
--   'nota'       nota clinica scritta a mano (il valore di prima, e il default)
--   'sintesi_ai' sintesi generata dall'Assistente Clinico AI
--   'progetto'   progetto terapeutico/riabilitativo, contenuto JSON a campi fissi
--   'relazione'  tenuto libero per quando la relazione si separera' dalla nota
--
-- ⚠️ IL BACKFILL LEGGE ANCORA IL PREFISSO, UNA VOLTA SOLA.
-- E' l'unico modo di sapere quali note esistenti sono sintesi AI. Da qui in
-- avanti il prefisso resta nel contenuto (lo legge il visore per estrarre il
-- JSON) ma NON serve piu' a riconoscere il tipo.
--
-- ⚠️ IL CODICE FUNZIONA ANCHE SENZA QUESTA MIGRATION.
-- js/cartella-clinica.js intercetta l'errore 42703 (colonna inesistente): la
-- relazione clinica continua a funzionare come prima e il progetto scrive a
-- schermo che manca la 039. Il 29 agosto tre round di debug sul PDF avevano
-- una sola causa — la 037 mai lanciata — e il sintomo non lo diceva.
--
-- SICURA DA ESEGUIRE DUE VOLTE: ADD COLUMN IF NOT EXISTS, UPDATE con
-- condizione che si spegne da sola, CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE public.clinical_notes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'nota';

-- Solo i valori previsti. Se un giorno ne serve un altro si tocca qui, e non
-- si scopre di avere sei tipi scritti in cinque modi diversi.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinical_notes_tipo_check'
  ) THEN
    ALTER TABLE public.clinical_notes
      ADD CONSTRAINT clinical_notes_tipo_check
      CHECK (tipo IN ('nota', 'relazione', 'progetto', 'sintesi_ai'));
  END IF;
END $$;

-- Backfill: le sintesi AI gia' in archivio prendono il loro tipo.
-- La condizione tipo <> 'sintesi_ai' fa si' che la seconda esecuzione non
-- tocchi nessuna riga.
UPDATE public.clinical_notes
   SET tipo = 'sintesi_ai'
 WHERE content LIKE '[SINTESI_AI_V1]%'
   AND tipo <> 'sintesi_ai';

-- Il progetto attivo di un paziente e' «la piu' recente di tipo progetto»:
-- questa e' esattamente la query che serve.
CREATE INDEX IF NOT EXISTS idx_clinical_notes_paziente_tipo
  ON public.clinical_notes (patient_id, tipo, updated_at DESC);

COMMIT;

-- VERIFICA (da incollare dopo, deve tornare la conta per tipo):
--   SELECT tipo, count(*) FROM public.clinical_notes GROUP BY tipo ORDER BY tipo;
