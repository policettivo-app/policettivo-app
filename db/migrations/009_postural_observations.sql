-- Migration 009: Note per piano anatomico + piano scapolare classificazione
-- Esegui nel SQL Editor di Supabase PRIMA di testare la nuova UI posturale

-- 5 colonne note separata per piano anatomico (valutazione posturale e visita fisioterapica)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_sagittale         text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_frontale          text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_posteriore        text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_podoscopio_sotto  text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_podoscopio_dietro text;

-- Piano scapolare: classificazione chip PRE 3R e POST 3R
-- Valori attesi: 'in_asse' | 'anteriore' | 'posteriore' | NULL
-- Nota: note_scapolare_pre e note_scapolare_post esistono già da migration 005
-- Vengono riutilizzati per salvare il valore del chip scapolare
-- (nessuna nuova colonna necessaria per lo scapolare)

-- Aggiorna il CHECK constraint su visit_photos.tipo per includere tutti i nuovi valori
-- (migration 005 aveva già rimosso il constraint; migration 008 documenta i valori)
-- Nessuna azione DDL aggiuntiva necessaria per visit_photos.

-- Verifica finale
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'visits'
  AND column_name LIKE 'note_%'
ORDER BY column_name;
