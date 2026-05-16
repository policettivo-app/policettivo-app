-- Migration 004: estende tabella patients con campi anagrafici e clinici completi
-- Esegui nel SQL Editor di Supabase prima di usare il nuovo form "Nuovo paziente".

ALTER TABLE patients ADD COLUMN IF NOT EXISTS data_nascita date;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sesso text CHECK (sesso IN ('M','F','Altro') OR sesso IS NULL);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS codice_fiscale text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS indirizzo text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS citta text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cap text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS professione text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS mano_dominante text CHECK (mano_dominante IN ('dx','sx','ambidestro') OR mano_dominante IS NULL);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS attivita_sportiva text CHECK (attivita_sportiva IN ('nessuna','amatoriale','agonistica') OR attivita_sportiva IS NULL);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sport_praticato text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergie text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS farmaci_in_uso text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patologie_pregresse text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS interventi_chirurgici text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medico_curante text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS specialista_inviante text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consenso_privacy boolean DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consenso_privacy_data timestamptz;

-- Verifica struttura dopo la migrazione
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'patients' ORDER BY ordinal_position;
