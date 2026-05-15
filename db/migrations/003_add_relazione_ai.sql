-- Migration 003: aggiunge relazione_ai alla tabella visits
-- Esegui nel SQL Editor di Supabase prima di usare lo Step 5 AI.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS relazione_ai text;

COMMENT ON COLUMN visits.relazione_ai IS
  'Relazione clinica generata dall''AI (Step 5). Editabile dal professionista dopo la generazione.';
