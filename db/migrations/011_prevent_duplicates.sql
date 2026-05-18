-- Migration 011: duplicate prevention
-- client_token columns + unique indexes + file_hash + check_patient_duplicate RPC

-- ── patients ──────────────────────────────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS client_token UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_client_token
  ON patients(client_token)
  WHERE client_token IS NOT NULL;

-- ── visits ────────────────────────────────────────────────────────────────────
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS client_token UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_client_token
  ON visits(client_token)
  WHERE client_token IS NOT NULL;

-- ── patient_protocols ─────────────────────────────────────────────────────────
ALTER TABLE patient_protocols
  ADD COLUMN IF NOT EXISTS client_token UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_protocols_client_token
  ON patient_protocols(client_token)
  WHERE client_token IS NOT NULL;

-- ── clinical_documents ────────────────────────────────────────────────────────
ALTER TABLE clinical_documents
  ADD COLUMN IF NOT EXISTS client_token UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clindoc_client_token
  ON clinical_documents(client_token)
  WHERE client_token IS NOT NULL;

ALTER TABLE clinical_documents
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clindoc_patient_hash
  ON clinical_documents(patient_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- ── check_patient_duplicate ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_patient_duplicate(
  p_professional_id  UUID,
  p_codice_fiscale   TEXT    DEFAULT NULL,
  p_email            TEXT    DEFAULT NULL,
  p_telefono         TEXT    DEFAULT NULL,
  p_exclude_id       UUID    DEFAULT NULL
)
RETURNS TABLE(
  id           UUID,
  nome         TEXT,
  cognome      TEXT,
  match_field  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM professionals pr
    WHERE pr.id = p_professional_id
      AND pr.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.cognome,
    CASE
      WHEN p_codice_fiscale IS NOT NULL
           AND upper(p.codice_fiscale) = upper(p_codice_fiscale)        THEN 'codice_fiscale'
      WHEN p_email IS NOT NULL
           AND lower(p.email) = lower(p_email)                         THEN 'email'
      WHEN p_telefono IS NOT NULL
           AND regexp_replace(p.telefono,  '\D', '', 'g')
             = regexp_replace(p_telefono, '\D', '', 'g')               THEN 'telefono'
    END AS match_field
  FROM patients p
  WHERE p.professional_id = p_professional_id
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    AND p.stato = 'attivo'
    AND (
      (p_codice_fiscale IS NOT NULL
       AND upper(p.codice_fiscale) = upper(p_codice_fiscale))
      OR
      (p_email IS NOT NULL
       AND lower(p.email) = lower(p_email))
      OR
      (p_telefono IS NOT NULL
       AND regexp_replace(p.telefono,  '\D', '', 'g')
         = regexp_replace(p_telefono, '\D', '', 'g'))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_patient_duplicate TO authenticated;
