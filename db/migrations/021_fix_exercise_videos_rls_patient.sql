-- =====================================================================
-- Migration 021: CORREZIONE RLS exercise_videos (31 mag 2026)
-- =====================================================================
-- CONTESTO: la migration 020 aveva legato la proprieta' dei video a
-- protocol_id. Ma la pagina video-esercizio.html spesso salva con
-- protocol_id NULL (il protocollo e' opzionale; il video appartiene al
-- PAZIENTE e viene eventualmente inserito nel protocollo in un secondo
-- momento). Risultato: l'INSERT veniva rifiutato dalla policy
-- ("new row violates row-level security policy").
--
-- FIX: la proprieta' del video si verifica via patient_id (sempre
-- presente) -> patients.professional_id -> professionals.user_id.
-- Stessa forza di protezione: il professionista vede/scrive SOLO i video
-- dei propri pazienti. Il paziente continua a vedere i video via
-- get_protocol_data (SECURITY DEFINER, bypassa RLS): nessuna perdita.
--
-- VERIFICATO sul DB il 31/05/2026:
--   - exercise_videos ha colonne: id, patient_id, protocol_id, ...
--   - patients ha professional_id (uuid)
--   - professionals.user_id = auth.uid()
-- =====================================================================

DROP POLICY IF EXISTS "Professionista vede i propri video"       ON public.exercise_videos;
DROP POLICY IF EXISTS "Professionista inserisce i propri video"  ON public.exercise_videos;
DROP POLICY IF EXISTS "Professionista aggiorna i propri video"   ON public.exercise_videos;
DROP POLICY IF EXISTS "Professionista cancella i propri video"   ON public.exercise_videos;

-- SELECT
CREATE POLICY "Professionista vede i propri video"
ON public.exercise_videos
FOR SELECT
USING (
  patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- INSERT
CREATE POLICY "Professionista inserisce i propri video"
ON public.exercise_videos
FOR INSERT
WITH CHECK (
  patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- UPDATE
CREATE POLICY "Professionista aggiorna i propri video"
ON public.exercise_videos
FOR UPDATE
USING (
  patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- DELETE
CREATE POLICY "Professionista cancella i propri video"
ON public.exercise_videos
FOR DELETE
USING (
  patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);
