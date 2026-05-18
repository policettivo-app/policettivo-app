-- Migration 015: URL del PDF generato della visita
-- Traccia dove è stato caricato il PDF su Supabase Storage.
-- NULL = PDF non ancora generato per questa visita.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

COMMENT ON COLUMN public.visits.pdf_url IS
  'URL pubblico del PDF della visita su Supabase Storage (clinical-docs/pdf-reports/{prof_id}/{visit_id}.pdf). NULL = non ancora generato.';
