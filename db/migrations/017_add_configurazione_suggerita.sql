-- Migration 017: aggiunge colonna configurazione_suggerita mancante
--
-- BUG STORICO: la colonna era usata da valutazione-posturale.html in collectFormData()
-- e quindi inclusa in ogni UPDATE su visits, ma non esisteva nel DB.
-- Risultato: ogni autosave falliva silenziosamente con PGRST204
-- "Could not find the 'configurazione_suggerita' column of 'visits' in the schema cache"
-- → tutto il payload veniva rifiutato, incluse le note_sagittale/frontale/etc.
-- → l'utente vedeva le osservazioni sotto le foto sparire dopo il reload.
--
-- FIX: aggiungere la colonna. Già applicata manualmente in produzione il 21/05/2026.
-- Questo file serve come documentazione e per riapplicare il setup in nuovi ambienti.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS configurazione_suggerita TEXT;
