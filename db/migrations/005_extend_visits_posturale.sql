-- Migration 005: estende visits per valutazione posturale dedicata
-- Esegui nel SQL Editor di Supabase PRIMA di testare valutazione-posturale.html

-- Tipo visita: fisioterapica (default per esistenti) o posturale
ALTER TABLE visits ADD COLUMN IF NOT EXISTS tipo text
  CHECK (tipo IN ('fisioterapica','posturale') OR tipo IS NULL);
UPDATE visits SET tipo = 'fisioterapica' WHERE tipo IS NULL;

-- Note osservazionali e piano scapolare
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_osservazionali text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_scapolare_pre  text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS note_scapolare_post text;

-- Valutazione del piede
ALTER TABLE visits ADD COLUMN IF NOT EXISTS arco_plantare text
  CHECK (arco_plantare IN ('piatto','cavo','normale') OR arco_plantare IS NULL);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS assetto_podalico text
  CHECK (assetto_podalico IN ('valgo','varo','normale','misto') OR assetto_podalico IS NULL);

-- Test monopodalico equilibrio
ALTER TABLE visits ADD COLUMN IF NOT EXISTS monopodalico_dx text
  CHECK (monopodalico_dx IN ('inversione','eversione','neutro') OR monopodalico_dx IS NULL);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS monopodalico_sx text
  CHECK (monopodalico_sx IN ('inversione','eversione','neutro') OR monopodalico_sx IS NULL);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS monopodalico_note text;

-- Configurazione posturale suggerita dalla valutazione
ALTER TABLE visits ADD COLUMN IF NOT EXISTS configurazione_suggerita text
  CHECK (configurazione_suggerita IN ('NPL','GPL') OR configurazione_suggerita IS NULL);

-- Estendi visit_photos con tipi foto posturali specifici
ALTER TABLE visit_photos DROP CONSTRAINT IF EXISTS visit_photos_tipo_check;
ALTER TABLE visit_photos ADD CONSTRAINT visit_photos_tipo_check
  CHECK (tipo IN (
    'sagittale','frontale','posteriore','podoscopio','piano_scapolare','altro',
    'sagittale_dx','sagittale_sx',
    'podoscopio_sotto','podoscopio_dietro',
    'piano_scapolare_pre','piano_scapolare_post',
    'libera'
  ) OR tipo IS NULL);

-- Titolo e descrizione per foto libere
ALTER TABLE visit_photos ADD COLUMN IF NOT EXISTS titolo      text;
ALTER TABLE visit_photos ADD COLUMN IF NOT EXISTS descrizione text;

-- Verifica
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'visits'
  AND column_name IN ('tipo','arco_plantare','assetto_podalico','monopodalico_dx','configurazione_suggerita')
ORDER BY ordinal_position;
