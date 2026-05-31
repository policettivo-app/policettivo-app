-- =====================================================================
-- Migration 022: Sistema consensi (consents) - 31 mag 2026
-- =====================================================================
-- Tabella storica immutabile (append-only) dei consensi paziente e
-- professionista + RPC per registrare il consenso paziente (token-based,
-- SECURITY DEFINER, stesso pattern di get_protocol_data).
-- Titolare dati sanitari = professionista; PHYSIOMOOD = responsabile.
--
-- Valori 'documento' in uso:
--   'informativa_paziente'           -> consenso del paziente (via consenso.html, RPC)
--   'dichiarazione_consenso_paziente'-> dichiarazione del professionista di aver
--                                       raccolto il consenso firmato del paziente
--                                       (registrata da dashboard.html e paziente.html)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  soggetto_tipo   text NOT NULL CHECK (soggetto_tipo IN ('paziente','professionista')),
  patient_id      uuid REFERENCES public.patients(id)      ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  documento       text NOT NULL,
  versione        text NOT NULL,
  caselle         jsonb,
  accettato_at    timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  revocato_at     timestamptz,
  CONSTRAINT consent_soggetto_ck CHECK (
    (soggetto_tipo = 'paziente'      AND patient_id      IS NOT NULL) OR
    (soggetto_tipo = 'professionista' AND professional_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_consents_patient      ON public.consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_professional ON public.consents(professional_id);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionista legge i consensi di competenza"
ON public.consents FOR SELECT
USING (
  professional_id IN (SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid())
  OR patient_id IN (
    SELECT p.id FROM public.patients p
    WHERE p.professional_id IN (SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid())
  )
);

CREATE POLICY "Professionista registra il proprio consenso"
ON public.consents FOR INSERT
WITH CHECK (
  soggetto_tipo = 'professionista'
  AND professional_id IN (SELECT pr.id FROM public.professionals pr WHERE pr.user_id = auth.uid())
);

-- RPC consenso paziente (token-based, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.record_consent_paziente(
  p_token text, p_documento text, p_versione text,
  p_caselle jsonb DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid; v_patient_id uuid; v_consent_id uuid;
BEGIN
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN RETURN NULL; END IF;
  IF p_documento IS NULL OR LENGTH(TRIM(p_documento)) = 0
     OR p_versione IS NULL OR LENGTH(TRIM(p_versione)) = 0 THEN RETURN NULL; END IF;
  BEGIN v_token := p_token::uuid; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  SELECT id INTO v_patient_id FROM patients WHERE access_token = v_token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO consents (soggetto_tipo, patient_id, documento, versione, caselle, user_agent)
  VALUES ('paziente', v_patient_id, p_documento, p_versione, p_caselle, p_user_agent)
  RETURNING id INTO v_consent_id;
  RETURN v_consent_id;
END;
$function$;
