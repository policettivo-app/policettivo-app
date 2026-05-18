-- Migration 014: logo personalizzato per branding professionale
-- Feature Premium: il logo del professionista appare nei PDF generati.
-- NULL = usa solo logo Policettivo di default.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.professionals.logo_url IS
  'URL pubblico del logo del professionista, mostrato nei PDF generati. NULL = usa logo Policettivo di default.';
