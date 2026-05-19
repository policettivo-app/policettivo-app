-- Migration 016: relazione AI cross-visita (storia clinica completa)
-- Separata da relazione_ai (singola visita) per non sovrascrivere.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS relazione_ai_storia TEXT;

COMMENT ON COLUMN public.visits.relazione_ai_storia IS
  'Relazione AI cross-visita: sintesi clinica basata su ultime 5 visite del paziente. NULL = non ancora generata.';
