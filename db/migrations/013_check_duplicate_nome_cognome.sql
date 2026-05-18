-- Migration 013: estende check_patient_duplicate con match su nome+cognome
--
-- Aggiunge 2 parametri opzionali in coda (p_nome, p_cognome).
-- Le chiamate esistenti senza questi parametri continuano a funzionare.
-- Il match è case-insensitive e trimmed; priorità più bassa di CF/email/telefono.
-- Mantiene: auth.uid() ownership check, filtro stato='attivo', SECURITY DEFINER.

CREATE OR REPLACE FUNCTION check_patient_duplicate(
  p_professional_id  UUID,
  p_codice_fiscale   TEXT    DEFAULT NULL,
  p_email            TEXT    DEFAULT NULL,
  p_telefono         TEXT    DEFAULT NULL,
  p_exclude_id       UUID    DEFAULT NULL,
  p_nome             TEXT    DEFAULT NULL,
  p_cognome          TEXT    DEFAULT NULL
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
           AND upper(p.codice_fiscale) = upper(p_codice_fiscale)              THEN 'codice_fiscale'
      WHEN p_email IS NOT NULL
           AND lower(p.email) = lower(p_email)                               THEN 'email'
      WHEN p_telefono IS NOT NULL
           AND regexp_replace(p.telefono,  '\D', '', 'g')
             = regexp_replace(p_telefono, '\D', '', 'g')                     THEN 'telefono'
      WHEN p_nome IS NOT NULL AND p_cognome IS NOT NULL
           AND lower(trim(p.nome))    = lower(trim(p_nome))
           AND lower(trim(p.cognome)) = lower(trim(p_cognome))               THEN 'nome_cognome'
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
      OR
      (p_nome IS NOT NULL AND p_cognome IS NOT NULL
       AND lower(trim(p.nome))    = lower(trim(p_nome))
       AND lower(trim(p.cognome)) = lower(trim(p_cognome)))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_patient_duplicate TO authenticated;
