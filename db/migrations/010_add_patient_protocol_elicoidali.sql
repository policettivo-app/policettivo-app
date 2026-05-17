-- Migration 010: add patient_protocol_elicoidali table
-- Esercizi Elicoidali are stored separately from standard exercises
-- because they use a TEXT id (e.g. "1E-NLP") instead of a UUID FK.

CREATE TABLE IF NOT EXISTS patient_protocol_elicoidali (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_protocol_id  UUID NOT NULL REFERENCES patient_protocols(id) ON DELETE CASCADE,
  elicoidale_id        TEXT NOT NULL,
  ordine               INTEGER NOT NULL DEFAULT 0,
  durata               INTEGER NOT NULL DEFAULT 60,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patient_protocol_elicoidali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals can manage elicoidali"
  ON patient_protocol_elicoidali
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM patient_protocols pp
      JOIN patients p ON p.id = pp.patient_id
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pp.id = patient_protocol_id
        AND pr.user_id = auth.uid()
    )
  );

-- Anon access is intentionally absent: patient-facing reads go through
-- the SECURITY DEFINER RPC get_protocol_data() which includes elicoidali
-- in its response payload. No direct table access needed (or allowed) for anon.
