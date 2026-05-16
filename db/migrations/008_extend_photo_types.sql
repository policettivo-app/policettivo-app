-- Migration 008: Estende i tipi ammessi per visit_photos.tipo
-- (nuova struttura per piano anatomico: 6 piani × PRE/POST)
-- Run in Supabase SQL editor

-- Drop existing CHECK constraint if any (adjust constraint name as needed)
-- ALTER TABLE visit_photos DROP CONSTRAINT IF EXISTS visit_photos_tipo_check;

-- No CHECK constraint on tipo by default in this schema —
-- the new tipo values are simply used as-is.
-- If a CHECK constraint exists, extend it to include all new values:

-- New tipo values accepted:
--   sagittale_dx_pre, sagittale_dx_post
--   sagittale_sx_pre, sagittale_sx_post
--   frontale_pre,     frontale_post
--   posteriore_pre,   posteriore_post
--   podoscopio_sotto_pre,  podoscopio_sotto_post
--   podoscopio_dietro_pre, podoscopio_dietro_post
--   libera  (unchanged)
-- Legacy values (still stored, not rendered in new UI):
--   sagittale_dx, sagittale_sx, frontale, posteriore,
--   podoscopio_sotto, podoscopio_dietro,
--   piano_scapolare_pre, piano_scapolare_post

-- No DDL needed unless a CHECK constraint was previously created.
-- This file serves as documentation of the new tipo taxonomy.
SELECT 1; -- no-op statement to validate migration ran
