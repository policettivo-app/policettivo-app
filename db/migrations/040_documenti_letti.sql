-- Migration 040: quello che c'e' scritto dentro un referto
-- referti-letti-v1 · 1 settembre 2026
--
-- PERCHE'.
-- Nella Sintesi AI i documenti del paziente entrano cosi':
--     - referto: RMN lombare (12/03/2026)
-- Cioe' il TIPO e la DESCRIZIONE che ha scritto il professionista. Il
-- contenuto del referto non viene letto da nessuno. Chiedere all'assistente
-- «ci sono red flag nei documenti che ho caricato» era quindi una domanda
-- senza risposta possibile: quei documenti non li ha mai aperti.
--
-- /api/analisi-referto sa gia' leggere un'immagine, ma il risultato serviva
-- solo a precompilare un form e veniva buttato via. Qui il lavoro si salva
-- una volta sola, e da li' in avanti e' disponibile a ogni sintesi.
--
-- COSA C'E' DENTRO rilievi (jsonb):
--   {
--     "tipo_documento": "RMN rachide lombosacrale",
--     "data_documento": "2026-03-12",
--     "struttura": "Ospedale ...",
--     "diagnosi": ["ernia discale L5-S1"],
--     "condizioni_rilevanti": ["gravidanza", "neoplasia", ...],
--     "dispositivi_impiantati": ["pacemaker", "placca e viti tibia dx"],
--     "farmaci": ["warfarin 5 mg"],
--     "esami_alterati": ["INR 3.4"],
--     "citazioni": ["frase testuale dal documento", ...]
--   }
--
-- ⚠️ LE CITAZIONI NON SONO UN DI PIU'.
-- Un avviso clinico che non si puo' risalire alla riga del referto da cui
-- viene non e' verificabile, e non deve entrare in un documento firmato dal
-- professionista. Ogni rilievo deve poter essere ricondotto a una frase che
-- nel documento c'e' davvero.
--
-- ⚠️ QUESTA COLONNA NON DECIDE NIENTE.
-- Qui si registra solo CIO' CHE IL DOCUMENTO DICE. L'incrocio con le
-- controindicazioni delle terapie arrivera' dopo, quando l'elenco sara'
-- stato riletto dal professionista.
--
-- IL CODICE FUNZIONA ANCHE SENZA QUESTA MIGRATION: paziente.html intercetta
-- l'errore 42703, la cartella continua a funzionare e il pulsante di lettura
-- scrive che manca la 040.
--
-- SICURA DA ESEGUIRE DUE VOLTE: solo ADD COLUMN IF NOT EXISTS e
-- CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE public.clinical_documents
  ADD COLUMN IF NOT EXISTS estratto_ai    text,
  ADD COLUMN IF NOT EXISTS estratto_ai_il timestamptz,
  ADD COLUMN IF NOT EXISTS rilievi        jsonb;

-- «Quali documenti di questo paziente non sono ancora stati letti»: e' la
-- domanda che la Sintesi AI fa ogni volta per poter dichiarare cosa le manca.
CREATE INDEX IF NOT EXISTS idx_clinical_documents_da_leggere
  ON public.clinical_documents (patient_id)
  WHERE estratto_ai IS NULL;

COMMIT;

-- VERIFICA (da incollare dopo):
--   SELECT count(*) FILTER (WHERE estratto_ai IS NOT NULL) AS letti,
--          count(*) FILTER (WHERE estratto_ai IS NULL)     AS da_leggere
--     FROM public.clinical_documents;
