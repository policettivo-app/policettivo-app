-- Migration 006: aggiunge annotazioni vettoriali alle foto di visita
-- Esegui nel SQL Editor di Supabase PRIMA di testare il disegno su foto.

ALTER TABLE visit_photos ADD COLUMN IF NOT EXISTS annotazioni jsonb;

COMMENT ON COLUMN visit_photos.annotazioni IS
  'Annotazioni vettoriali sulla foto (linee, punti) generate dal tool di disegno. '
  'Struttura: { "cw": <canvas_w>, "ch": <canvas_h>, "lines": [ { "type": "line"|"point", "lt": "h|v|f", "nx1": 0.0-1.0, "ny1": 0.0-1.0, "nx2": 0.0-1.0, "ny2": 0.0-1.0, "color": "#hex", "lw": 2.5 } ] }. '
  'Le coordinate sono normalizzate (0-1) per device independence. '
  'NON sovrascrive la foto originale: le annotazioni sono un layer separato.';

-- Verifica
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'visit_photos' AND column_name = 'annotazioni';
