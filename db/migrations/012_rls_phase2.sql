-- ============================================================
-- Migration 012: RLS Fase 2 — chiusura data leak e abilitazione
-- RLS su visits e visit_photos
--
-- SCOPO:
--   A) Rimuove 11 policy permissive (USING true o solo token)
--      che espongono dati a chiunque con anon key.
--   B) Abilita RLS su visits e visit_photos (erano aperte).
--   C) Aggiunge policy professionista su visits e visit_photos.
--
-- INVARIANTI:
--   - Le policy "Professionista...", "Admin can delete...",
--     "cn_*_own" già esistenti NON vengono toccate.
--   - clinical_documents e clinical_notes NON vengono toccate.
--   - Nessuna RPC SECURITY DEFINER viene modificata.
--   - Il flusso paziente pubblico continua via RPC:
--       get_patient_by_token, get_protocol_data,
--       get_diary_entries, save_diary_entry,
--       get_patient_sessions, save_therapy_session,
--       update_session_feedback.
--
-- IDEMPOTENZA:
--   DROP POLICY IF EXISTS → sicuro da rieseguire.
--   DROP + CREATE sulle policy nuove → idempotente.
--
-- ANALISI PRE-ESECUZIONE (grepping pagine pubbliche):
--   pagella.html, protocollo.html, rapida.html, esercizio.html
--   → zero accessi diretti alle 9 tabelle.
--   diario.html → accede a patients/patient_protocols/
--   therapy_sessions MA richiede getSession() + redirect login:
--   è una pagina professionista, non pubblica.
-- ============================================================


-- ============================================================
-- PARTE A — Rimozione policy permissive (data leak)
-- ============================================================

-- patients: accesso diretto via token (bypass RLS professionista)
DROP POLICY IF EXISTS "Accesso pubblico tramite token"
  ON public.patients;
DROP POLICY IF EXISTS "Aggiornamento pubblico tramite token"
  ON public.patients;

-- patient_protocols: lettura/scrittura pubblica senza restrizioni
DROP POLICY IF EXISTS "Protocolli pubblici in lettura"
  ON public.patient_protocols;
DROP POLICY IF EXISTS "Protocolli inserimento"
  ON public.patient_protocols;
DROP POLICY IF EXISTS "Protocolli aggiornamento"
  ON public.patient_protocols;

-- patient_protocol_exercises: lettura/inserimento pubblici
DROP POLICY IF EXISTS "Esercizi protocollo pubblici"
  ON public.patient_protocol_exercises;
DROP POLICY IF EXISTS "Esercizi protocollo inserimento"
  ON public.patient_protocol_exercises;

-- diary_entries: lettura/inserimento pubblici
DROP POLICY IF EXISTS "Diario lettura libera"
  ON public.diary_entries;
DROP POLICY IF EXISTS "Diario inserimento libero"
  ON public.diary_entries;

-- therapy_sessions: lettura pubblica + update feedback senza auth
DROP POLICY IF EXISTS "Accesso pubblico lettura per paziente"
  ON public.therapy_sessions;
DROP POLICY IF EXISTS "Aggiornamento feedback paziente"
  ON public.therapy_sessions;


-- ============================================================
-- PARTE B — Abilitazione RLS su tabelle ancora aperte
-- ============================================================

ALTER TABLE public.visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PARTE C — Policy su visits (solo professionista autenticato)
-- ============================================================

DROP POLICY IF EXISTS "Professionista vede le proprie visite"
  ON public.visits;
CREATE POLICY "Professionista vede le proprie visite"
  ON public.visits
  FOR SELECT
  TO authenticated
  USING (
    professional_id = (
      SELECT pr.id FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Professionista inserisce le proprie visite"
  ON public.visits;
CREATE POLICY "Professionista inserisce le proprie visite"
  ON public.visits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    professional_id = (
      SELECT pr.id FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Professionista aggiorna le proprie visite"
  ON public.visits;
CREATE POLICY "Professionista aggiorna le proprie visite"
  ON public.visits
  FOR UPDATE
  TO authenticated
  USING (
    professional_id = (
      SELECT pr.id FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    professional_id = (
      SELECT pr.id FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Professionista cancella le proprie visite"
  ON public.visits;
CREATE POLICY "Professionista cancella le proprie visite"
  ON public.visits
  FOR DELETE
  TO authenticated
  USING (
    professional_id = (
      SELECT pr.id FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
      LIMIT 1
    )
  );


-- ============================================================
-- PARTE D — Policy su visit_photos (JOIN via visits)
-- ============================================================

DROP POLICY IF EXISTS "Professionista vede le proprie foto visita"
  ON public.visit_photos;
CREATE POLICY "Professionista vede le proprie foto visita"
  ON public.visit_photos
  FOR SELECT
  TO authenticated
  USING (
    visit_id IN (
      SELECT v.id FROM public.visits v
      JOIN public.patients p  ON p.id  = v.patient_id
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista inserisce foto visita"
  ON public.visit_photos;
CREATE POLICY "Professionista inserisce foto visita"
  ON public.visit_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    visit_id IN (
      SELECT v.id FROM public.visits v
      JOIN public.patients p  ON p.id  = v.patient_id
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista aggiorna foto visita"
  ON public.visit_photos;
CREATE POLICY "Professionista aggiorna foto visita"
  ON public.visit_photos
  FOR UPDATE
  TO authenticated
  USING (
    visit_id IN (
      SELECT v.id FROM public.visits v
      JOIN public.patients p  ON p.id  = v.patient_id
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    visit_id IN (
      SELECT v.id FROM public.visits v
      JOIN public.patients p  ON p.id  = v.patient_id
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista cancella foto visita"
  ON public.visit_photos;
CREATE POLICY "Professionista cancella foto visita"
  ON public.visit_photos
  FOR DELETE
  TO authenticated
  USING (
    visit_id IN (
      SELECT v.id FROM public.visits v
      JOIN public.patients p  ON p.id  = v.patient_id
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );


-- ============================================================
-- PARTE E — Verifica post-esecuzione (esegui manualmente)
-- ============================================================
/*
SELECT
  pc.relname      AS tabella,
  po.polname      AS policy_name,
  CASE po.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END             AS command,
  pg_get_expr(po.polqual,      po.polrelid) AS using_expr,
  pg_get_expr(po.polwithcheck, po.polrelid) AS with_check_expr
FROM pg_policy po
JOIN pg_class  pc ON pc.oid = po.polrelid
WHERE pc.relname IN (
  'patients',
  'patient_protocols',
  'patient_protocol_exercises',
  'diary_entries',
  'therapy_sessions',
  'visits',
  'visit_photos'
)
ORDER BY pc.relname, po.polname;

-- Atteso dopo migration:
--   patients             → solo "Professionista...", "Admin can delete..."
--   patient_protocols    → solo "Professionista...", "Admin can delete..."
--   patient_protocol_exercises → solo "Professionista...", "Admin can delete..."
--   diary_entries        → solo "Professionista...", "Admin can delete..."
--   therapy_sessions     → solo "Professionista gestisce sue sedute"
--   visits               → 4 policy "Professionista..."
--   visit_photos         → 4 policy "Professionista..."
--
-- NON atteso (devono essere sparite):
--   "Accesso pubblico tramite token"
--   "Aggiornamento pubblico tramite token"
--   "Protocolli aggiornamento/inserimento/pubblici in lettura"
--   "Esercizi protocollo inserimento/pubblici"
--   "Diario inserimento libero/lettura libera"
--   "Accesso pubblico lettura per paziente"
--   "Aggiornamento feedback paziente"
*/
