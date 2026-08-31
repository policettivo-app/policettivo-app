-- Migration 038: allineamento delle foto per il confronto nel tempo
-- confronto-nel-tempo-v1 · 31 agosto 2026
--
-- PERCHE'.
-- Due foto scattate a settimane di distanza hanno distanza dal muro, altezza
-- della fotocamera e posizione dei piedi diverse. Sovrapporle cosi' com'e'
-- mostra una "differenza" che puo' essere fotografica e non posturale: e' il
-- modo piu' rapido per raccontare a un paziente un miglioramento che non c'e'.
-- Il setup dello studio pero' i riferimenti veri li ha, e si vedono nelle foto:
-- filo a piombo rosso a muro, crociera del tappetino, riga graduata. Il
-- professionista tocca DUE punti su ciascuna foto (per esempio filo a piombo in
-- alto e centro della crociera) e l'app ricava scala, rotazione e traslazione
-- per portare la seconda foto sulla prima.
--
-- PERCHE' LA CHIAVE E' storage_path E NON visit_photos.id.
-- La stessa foto e' condivisa fra righe diverse: una posturale importata dentro
-- una visita fisioterapica aggiunge una riga in visit_photos che punta allo
-- STESSO file (vedi visita-importa-posturale-v1). Se l'allineamento stesse
-- sulla riga, la stessa identica foto risulterebbe allineata da una parte e non
-- dall'altra. L'allineamento e' una proprieta' del FILE, e qui lo si scrive una
-- volta sola. Cosi' vale anche per le foto della scheda paziente, che stanno in
-- patients.foto_url e una riga in visit_photos non ce l'hanno affatto.
--
-- COSA C'E' DENTRO punti (jsonb):
--   { "a": {"x":0.51,"y":0.07}, "b": {"x":0.49,"y":0.88} }
-- x e y sono normalizzati 0-1 sul lato lungo dell'immagine, come le
-- annotazioni del disegno: la stessa foto guardata su telefono o su desktop
-- da' gli stessi due punti.
--
-- SICURA DA ESEGUIRE DUE VOLTE: CREATE TABLE / ADD COLUMN / CREATE INDEX con
-- IF NOT EXISTS, DROP POLICY IF EXISTS prima di ogni CREATE POLICY.
-- Nessun dato esistente viene toccato.

-- ============================================================
-- PARTE A — La tabella
-- ============================================================

CREATE TABLE IF NOT EXISTS public.foto_allineamenti (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  punti         jsonb NOT NULL,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.foto_allineamenti IS
  'Due punti di riferimento per foto (filo a piombo, crociera del tappetino) usati dal confronto nel tempo per scalare e allineare una foto sull altra. Chiave logica: storage_path, perche la stessa foto e condivisa fra piu righe di visit_photos.';
COMMENT ON COLUMN public.foto_allineamenti.storage_path IS
  'Percorso del file dentro il bucket privato clinical-docs. Vale sia per le foto di visita sia per le foto iniziali della scheda paziente.';
COMMENT ON COLUMN public.foto_allineamenti.punti IS
  'Coordinate normalizzate 0-1 sull immagine: { "a": {"x":..,"y":..}, "b": {"x":..,"y":..} }. Stessa convenzione delle annotazioni del disegno.';

-- Una foto, un allineamento. L unicita e su storage_path da solo: il file e uno.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foto_allin_path
  ON public.foto_allineamenti(storage_path);

CREATE INDEX IF NOT EXISTS idx_foto_allin_paziente
  ON public.foto_allineamenti(patient_id);


-- ============================================================
-- PARTE B — RLS: si vede solo l allineamento dei propri pazienti
-- Stesso schema di visit_photos (migration 012): il salto e
-- patients -> professionals -> auth.uid().
-- ============================================================

ALTER TABLE public.foto_allineamenti ENABLE ROW LEVEL SECURITY;

-- Supabase concede da solo i permessi sulle tabelle nuove del public schema,
-- ma se cosi non fosse l errore sarebbe "permission denied for table" e non
-- si capirebbe dalla pagina: meglio scriverlo qui. Ripetibile senza danno.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foto_allineamenti TO authenticated;

DROP POLICY IF EXISTS "Professionista vede i propri allineamenti"
  ON public.foto_allineamenti;
CREATE POLICY "Professionista vede i propri allineamenti"
  ON public.foto_allineamenti
  FOR SELECT
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista inserisce i propri allineamenti"
  ON public.foto_allineamenti;
CREATE POLICY "Professionista inserisce i propri allineamenti"
  ON public.foto_allineamenti
  FOR INSERT
  TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista aggiorna i propri allineamenti"
  ON public.foto_allineamenti;
CREATE POLICY "Professionista aggiorna i propri allineamenti"
  ON public.foto_allineamenti
  FOR UPDATE
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista cancella i propri allineamenti"
  ON public.foto_allineamenti;
CREATE POLICY "Professionista cancella i propri allineamenti"
  ON public.foto_allineamenti
  FOR DELETE
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );


-- ============================================================
-- PARTE C — Il PDF del confronto va in cartella clinica
-- clinical_documents.file_url tiene un indirizzo, ma clinical-docs e un
-- bucket PRIVATO: quell indirizzo il browser non lo apre (lezione #7).
-- Si tiene anche il percorso, da firmare al momento dell apertura, come
-- gia si fa su visits.pdf_storage_path (migration 037).
-- ============================================================

ALTER TABLE public.clinical_documents
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN public.clinical_documents.storage_path IS
  'Percorso del file dentro il bucket privato clinical-docs. Si apre con una signed URL: file_url da solo non basta.';


-- ============================================================
-- VERIFICA — devono uscire 7 righe:
--   clinical_documents.storage_path
--   foto_allineamenti: aggiornato_il, creato_il, id, patient_id, punti, storage_path
-- ============================================================

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'foto_allineamenti')
    OR (table_name = 'clinical_documents' AND column_name = 'storage_path')
  )
ORDER BY table_name, column_name;
