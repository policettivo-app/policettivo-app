-- =====================================================================
-- Migration 020: FIX SICUREZZA RLS (audit Security Advisor 22 mag 2026)
-- =====================================================================
-- Sistema i 3 ERRORI critici del Security Advisor.
-- ADDITIVO e NON DISTRUTTIVO: non elimina dati, abilita solo le protezioni.
-- Eseguire UN BLOCCO ALLA VOLTA sul SQL editor Supabase e verificare.
--
-- VERIFICATO sul DB il 22/05/2026:
--   - Il portale paziente legge i video tramite la funzione SECURITY DEFINER
--     get_protocol_data(p_token) -> bypassa l'RLS -> i video continueranno
--     ad arrivare al paziente anche dopo aver abilitato RLS. NESSUNA PERDITA.
--   - exercise_videos lega al protocollo via colonna protocol_id.
--   - patient_protocols ha professional_id (uuid) diretto.
--   - patients lega via professional_id; professionals.user_id = auth.uid().
-- =====================================================================


-- ---------------------------------------------------------------------
-- FIX 1 — visite_legacy_2026_05 (tabella legacy, 1 riga orfana)
-- ---------------------------------------------------------------------
-- RLS senza policy = tabella chiusa a tutti via API = sicura.
-- Il dato resta. Recupero/DROP in sessione futura.
ALTER TABLE public.visite_legacy_2026_05 ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- FIX 2 — invites (email + nomi + token di inviti)
-- ---------------------------------------------------------------------
-- RLS senza policy = nessun accesso via API anon/authenticated.
-- Gli endpoint serverless (service_role) bypassano l'RLS: logica inviti OK.
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- FIX 3 — exercise_videos (video del protocollo, legati via protocol_id)
-- ---------------------------------------------------------------------
-- Abilita RLS + 4 policy per il PROFESSIONISTA LOGGATO.
-- Il PAZIENTE continua a vedere i video via get_protocol_data (SECURITY
-- DEFINER, bypassa RLS): queste policy NON lo riguardano.
-- Pattern: il video e' tuo se il suo protocol_id appartiene a un
-- patient_protocols il cui professional_id e' il tuo.
ALTER TABLE public.exercise_videos ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "Professionista vede i propri video"
ON public.exercise_videos
FOR SELECT
USING (
  protocol_id IN (
    SELECT pp.id FROM public.patient_protocols pp
    WHERE pp.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- INSERT
CREATE POLICY "Professionista inserisce i propri video"
ON public.exercise_videos
FOR INSERT
WITH CHECK (
  protocol_id IN (
    SELECT pp.id FROM public.patient_protocols pp
    WHERE pp.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- UPDATE
CREATE POLICY "Professionista aggiorna i propri video"
ON public.exercise_videos
FOR UPDATE
USING (
  protocol_id IN (
    SELECT pp.id FROM public.patient_protocols pp
    WHERE pp.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  protocol_id IN (
    SELECT pp.id FROM public.patient_protocols pp
    WHERE pp.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);

-- DELETE
CREATE POLICY "Professionista cancella i propri video"
ON public.exercise_videos
FOR DELETE
USING (
  protocol_id IN (
    SELECT pp.id FROM public.patient_protocols pp
    WHERE pp.professional_id IN (
      SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid()
    )
  )
);
