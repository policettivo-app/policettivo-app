-- ============================================================
-- POLICETTIVO® — Migrazione 001: Schema Visite Cliniche
-- ============================================================
--
-- COME ESEGUIRE:
--   1. Apri Supabase Dashboard → SQL Editor
--   2. Incolla l'intero file ed esegui
--   3. Verifica con le query di controllo in fondo al file
--   4. NON attivare RLS ora: verrà fatto in 002_enable_rls_visits.sql
--      dopo che visita.html sarà testato e funzionante
--
-- DIPENDENZE:
--   Richiede che esistano già le tabelle:
--     patients, professionals, patient_protocols
--
-- IDEMPOTENZA:
--   Il file usa CREATE TABLE IF NOT EXISTS e OR REPLACE dove possibile.
--   Sicuro da rieseguire se interrotto a metà (non crea duplicati).
--
-- LEGACY:
--   therapy_sessions NON viene toccata. Resta come archivio storico.
--   Le nuove visite strutturate a 5 step vanno in questa tabella.
-- ============================================================


-- ============================================================
-- CLEANUP — Rimuove tabelle/oggetti se esistono da run precedenti
-- ============================================================
-- Sicuro da eseguire: se le tabelle non esistono, IF EXISTS le ignora.
-- CASCADE elimina automaticamente trigger, indici e constraint dipendenti.
-- ATTENZIONE: cancella tutti i dati in visits e visit_photos.
-- In questa fase iniziale non c'è nulla dentro, quindi è sicuro.
--
-- ORDINE OBBLIGATORIO:
--   1. visit_photos prima di visits (FK visits → visits.id)
--   2. visits con CASCADE (porta via trigger e indici)
--   3. funzioni standalone dopo (non hanno dipendenze dalle tabelle)
-- NOTA: DROP TRIGGER ... ON visits NON è incluso perché richiede
--   che la tabella esista — DROP TABLE CASCADE lo rimuove implicitamente.

DROP TABLE    IF EXISTS visit_photos                          CASCADE;
DROP TABLE    IF EXISTS visits                                CASCADE;
DROP FUNCTION IF EXISTS trg_visits_updated_at()              CASCADE;
DROP FUNCTION IF EXISTS duplica_visita_precedente(uuid, uuid) CASCADE;

-- ============================================================


-- ============================================================
-- A) TABELLA PRINCIPALE: visits
-- ============================================================
-- Ogni riga rappresenta una visita clinica completa a 5 step:
--   Step 1 → Anamnesi
--   Step 2 → Valutazione Fisioterapica (VAS + ROM + test ortopedici)
--   Step 3 → Valutazione Posturale (foto in visit_photos + AI)
--   Step 4 → Trattamento (VAS seduta + tecniche)
--   Step 5 → Rivalutazione (note finali + prossima visita)
--
-- Strategia colonne: i campi scalari sono colonne tipizzate (query
-- dirette, es: VAS > 7). I test clinici compositi (ROM, ortopedici)
-- sono JSONB per flessibilità senza migrazioni future.
-- ============================================================

CREATE TABLE IF NOT EXISTS visits (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  professional_id           uuid        NOT NULL REFERENCES professionals(id),
  data_visita               timestamptz NOT NULL DEFAULT now(),

  -- Stato del documento clinico.
  -- 'bozza'  → modificabile, autosave attivo, non visibile al paziente
  -- 'chiusa' → readonly, PDF generabile, equivale a firma del professionista
  stato                     text        NOT NULL DEFAULT 'bozza'
                                        CHECK (stato IN ('bozza', 'chiusa')),
  chiusa_at                 timestamptz,          -- valorizzato quando stato diventa 'chiusa'

  -- ----------------------------------------------------------
  -- STEP 1 — Anamnesi
  -- ----------------------------------------------------------
  motivo_visita             text,                 -- motivo principale della visita
  storia_clinica            text,                 -- anamnesi libera
  durata_sintomi            text,                 -- chip: meno_1_sett | 1_4_sett | 1_3_mesi | piu_3_mesi | cronico
  insorgenza                text,                 -- chip: improvvisa | graduale | post_trauma | sconosciuta
  obiettivi_paziente        text,                 -- obiettivi dichiarati dal paziente
  diagnosi_funzionale       text,                 -- diagnosi fisioterapica (non medica)

  -- ----------------------------------------------------------
  -- STEP 2 — Valutazione Fisioterapica
  -- ----------------------------------------------------------

  -- VAS di valutazione (distinti dal VAS di seduta in Step 4):
  -- misurano il dolore percepito dal paziente prima del trattamento
  vas_riposo                int         CHECK (vas_riposo            BETWEEN 0 AND 10),
  vas_movimento             int         CHECK (vas_movimento         BETWEEN 0 AND 10),
  vas_picco_settimanale     int         CHECK (vas_picco_settimanale BETWEEN 0 AND 10),

  -- Test ortopedici — struttura JSONB attesa:
  -- {
  --   "lasegue":         { "esito": "positivo|negativo|non_eseguito", "nota": "a 45°" },
  --   "patrick":         { "esito": "positivo|negativo|non_eseguito", "nota": "" },
  --   "valsalva":        { "esito": "positivo|negativo|non_eseguito", "nota": "" },
  --   "spurling":        { "esito": "positivo|negativo|non_eseguito", "nota": "" },
  --   "ober":            { "esito": "positivo|negativo|non_eseguito", "nota": "" }
  -- }
  -- Le chiavi sono estensibili senza migrazioni.
  test_ortopedici           jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Test ROM — struttura JSONB attesa:
  -- {
  --   "flessione_lombare":  { "stato": "normale|limitato|aumentato", "gradi": 60, "nota": "" },
  --   "estensione_lombare": { "stato": "normale|limitato|aumentato", "gradi": 20, "nota": "" },
  --   "rot_dx_cervicale":   { "stato": "normale|limitato|aumentato", "gradi": 70, "nota": "" },
  --   "abduzione_spalla_dx":{ "stato": "normale|limitato|aumentato", "gradi": 90, "nota": "" }
  -- }
  -- I movimenti inclusi dipendono dal distretto trattato (estensibili).
  test_rom                  jsonb       NOT NULL DEFAULT '{}'::jsonb,

  note_valutazione          text,                 -- note libere Step 2

  -- ----------------------------------------------------------
  -- STEP 3 — Valutazione Posturale
  -- ----------------------------------------------------------
  -- Le foto sono in visit_photos (JOIN su visit_id).
  -- Qui restano solo i testi e i risultati AI.
  note_posturali            text,
  ai_analisi_posturale      text,                 -- testo restituito dall'API AI
  ai_suggerimento_config    text        CHECK (
                                          ai_suggerimento_config IN ('NPL', 'GPL', 'misto')
                                          OR ai_suggerimento_config IS NULL
                                        ),        -- suggerimento configurazione protocollo

  -- ----------------------------------------------------------
  -- STEP 4 — Trattamento
  -- ----------------------------------------------------------

  -- VAS di seduta: misurano la risposta al trattamento eseguito.
  -- Diversi dal VAS di valutazione (Step 2): qui si registra
  -- il dolore all'inizio e alla fine della seduta terapeutica.
  vas_inizio                int         CHECK (vas_inizio BETWEEN 0 AND 10),
  vas_fine                  int         CHECK (vas_fine   BETWEEN 0 AND 10),

  tecniche_trattamento      text,                 -- tecniche usate nella seduta
  tempo_trattamento_minuti  int,                  -- durata effettiva del trattamento
  risposta_paziente         text,                 -- risposta clinica osservata
  protocollo_assegnato_id   uuid        REFERENCES patient_protocols(id),

  -- ----------------------------------------------------------
  -- STEP 5 — Rivalutazione
  -- ----------------------------------------------------------
  miglioramenti             text,                 -- miglioramenti rilevati rispetto all'inizio
  note_finali               text,                 -- note di chiusura visita
  prossima_visita_at        timestamptz,          -- data/ora prossima visita pianificata
  indicazioni_paziente      text,                 -- istruzioni per il paziente a casa

  -- ----------------------------------------------------------
  -- Meta
  -- ----------------------------------------------------------
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()  -- aggiornato dal trigger sotto
);

COMMENT ON TABLE visits IS
  'Visite cliniche strutturate a 5 step (Anamnesi, Val. FT, Val. Posturale, '
  'Trattamento, Rivalutazione). Sostituisce therapy_sessions per le nuove '
  'visite; therapy_sessions resta come archivio legacy.';

COMMENT ON COLUMN visits.stato IS
  'bozza = visita in compilazione, modificabile, autosave attivo. '
  'chiusa = visita firmata dal professionista, readonly, PDF generabile. '
  'La chiusura è irreversibile salvo intervento admin.';

COMMENT ON COLUMN visits.test_ortopedici IS
  'JSONB. Struttura attesa per ogni test: '
  '{ "<nome_test>": { "esito": "positivo|negativo|non_eseguito", "nota": "<testo libero>" } }. '
  'Esempio: { "lasegue": { "esito": "positivo", "nota": "a 45 gradi" } }. '
  'Le chiavi sono estensibili senza migrazioni.';

COMMENT ON COLUMN visits.test_rom IS
  'JSONB. Struttura attesa per ogni movimento: '
  '{ "<distretto_movimento>": { "stato": "normale|limitato|aumentato", "gradi": <int>, "nota": "<testo>" } }. '
  'Esempio: { "flessione_lombare": { "stato": "limitato", "gradi": 60, "nota": "" } }. '
  'I movimenti variano per distretto clinico.';

COMMENT ON COLUMN visits.vas_riposo IS
  'VAS a riposo (Step 2 - Valutazione FT). Scala 0-10. '
  'Distinto da vas_inizio (Step 4): questo misura il dolore baseline, '
  'vas_inizio misura il dolore all''inizio della seduta terapeutica.';

COMMENT ON COLUMN visits.ai_analisi_posturale IS
  'Testo libero restituito dall''API AI (Claude) per l''analisi posturale. '
  'Funzione premium: free tier = max 5 analisi totali per professionista, '
  'premium = illimitato. Le foto di riferimento sono in visit_photos.';

-- ============================================================
-- B) TABELLA FOTO: visit_photos
-- ============================================================
-- Le foto posturali sono associate alla visita tramite visit_id.
-- Il file fisico è su Supabase Storage (bucket da configurare).
-- storage_path è il percorso nel bucket (es: "visits/{visit_id}/foto1.jpg").
-- url_pubblico è opzionale: si usa solo per bucket pubblici o signed URL.
-- ============================================================

CREATE TABLE IF NOT EXISTS visit_photos (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid  NOT NULL REFERENCES visits(id) ON DELETE CASCADE,

  -- Tipo di proiezione posturale
  tipo         text  CHECK (tipo IN (
                       'sagittale',
                       'frontale',
                       'posteriore',
                       'podoscopio',
                       'piano_scapolare',
                       'altro'
                     )),

  storage_path text  NOT NULL,   -- percorso nel bucket Supabase Storage
                                 -- convenzione: visits/{visit_id}/{tipo}_{timestamp}.jpg
  url_pubblico text,             -- signed URL o URL pubblico (opzionale, rigenerabile)
  note         text,             -- annotazione testuale sulla foto
  ordine       int   NOT NULL DEFAULT 0,  -- ordine di visualizzazione nella galleria
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE visit_photos IS
  'Foto posturali associate a una visita clinica. '
  'I file fisici sono su Supabase Storage, non nel DB. '
  'storage_path contiene il percorso nel bucket; url_pubblico è opzionale e rigenerabile. '
  'Non usare colonne base64 nel DB per le immagini: usare sempre Supabase Storage.';

COMMENT ON COLUMN visit_photos.storage_path IS
  'Percorso del file nel bucket Supabase Storage. '
  'Convenzione: visits/{visit_id}/{tipo}_{unix_timestamp}.jpg. '
  'Esempio: visits/abc123/sagittale_1715000000.jpg';

COMMENT ON COLUMN visit_photos.tipo IS
  'Proiezione posturale fotografata. Valori ammessi: '
  'sagittale, frontale, posteriore, podoscopio, piano_scapolare, altro.';


-- ============================================================
-- C) INDICI PER PERFORMANCE
-- ============================================================

-- Caricamento lista visite di un paziente (ordinata per data, più recente prima)
CREATE INDEX IF NOT EXISTS idx_visits_patient_data
  ON visits(patient_id, data_visita DESC);

-- Dashboard professionista: tutte le visite per professional_id
CREATE INDEX IF NOT EXISTS idx_visits_professional
  ON visits(professional_id, data_visita DESC);

-- Bozze aperte: alert visiva al professionista per visite non chiuse
-- Index parziale: copre solo le righe 'bozza', molto selettivo
CREATE INDEX IF NOT EXISTS idx_visits_stato_bozza
  ON visits(stato, professional_id)
  WHERE stato = 'bozza';

-- Query analitiche su test ortopedici (es: "tutti i positivi al Lasègue")
CREATE INDEX IF NOT EXISTS idx_visits_test_ortopedici_gin
  ON visits USING GIN(test_ortopedici);

-- Query analitiche su ROM (es: "flessione lombare < 60°")
CREATE INDEX IF NOT EXISTS idx_visits_test_rom_gin
  ON visits USING GIN(test_rom);

-- Galleria foto di una visita, nell'ordine corretto
CREATE INDEX IF NOT EXISTS idx_visit_photos_visit
  ON visit_photos(visit_id, ordine);


-- ============================================================
-- D) TRIGGER: aggiornamento automatico updated_at
-- ============================================================
-- Ogni UPDATE su visits aggiorna automaticamente updated_at = now().
-- Essenziale per l'autosave: il professionista vede quando è stato
-- salvato l'ultimo step senza bisogno di gestirlo nel frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_visits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP + CREATE per idempotenza (OR REPLACE non funziona sui trigger)
DROP TRIGGER IF EXISTS visits_set_updated_at ON visits;

CREATE TRIGGER visits_set_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW
  EXECUTE FUNCTION trg_visits_updated_at();


-- ============================================================
-- E) RPC: duplica_visita_precedente
-- ============================================================
-- Crea una nuova visita in bozza copiando i campi "stabili" dall'ultima
-- visita chiusa del paziente (anamnesi, diagnosi, test di base).
-- NON duplica: VAS, trattamento, posturale, rivalutazione, foto.
--
-- Chiamata dal frontend al click "Nuova visita da precedente":
--   supabase.rpc('duplica_visita_precedente', {
--     p_patient_id: '...',
--     p_professional_id: '...'
--   })
-- Ritorna: uuid della nuova visita bozza, o null se nessuna precedente.
-- ============================================================

CREATE OR REPLACE FUNCTION duplica_visita_precedente(
  p_patient_id       uuid,
  p_professional_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultima    visits%ROWTYPE;
  v_nuova_id  uuid;
BEGIN
  -- Validazione parametri
  IF p_patient_id IS NULL OR p_professional_id IS NULL THEN
    RAISE EXCEPTION 'patient_id e professional_id sono obbligatori';
  END IF;

  -- Trova l'ultima visita CHIUSA del paziente
  -- (non dupliciamo bozze: potrebbero essere incomplete)
  SELECT * INTO v_ultima
  FROM visits
  WHERE patient_id      = p_patient_id
    AND professional_id = p_professional_id
    AND stato           = 'chiusa'
  ORDER BY data_visita DESC
  LIMIT 1;

  -- Crea nuova bozza, con o senza dati precedenti
  INSERT INTO visits (
    patient_id,
    professional_id,
    stato,
    -- Step 1: dati anamnestici stabili → duplicati come punto di partenza
    motivo_visita,
    storia_clinica,
    durata_sintomi,
    insorgenza,
    obiettivi_paziente,
    diagnosi_funzionale,
    -- Step 2: test di base → duplicati come riferimento (il FT li aggiornerà)
    test_ortopedici,
    test_rom
    -- Step 2 VAS → NON duplicato: si misurano sempre ex novo
    -- Step 3 posturale → NON duplicato: nuove foto ogni visita
    -- Step 4 trattamento → NON duplicato: cambia ogni seduta
    -- Step 5 rivalutazione → NON duplicato: specifica della seduta
  ) VALUES (
    p_patient_id,
    p_professional_id,
    'bozza',
    v_ultima.motivo_visita,
    v_ultima.storia_clinica,
    v_ultima.durata_sintomi,
    v_ultima.insorgenza,
    v_ultima.obiettivi_paziente,
    v_ultima.diagnosi_funzionale,
    COALESCE(v_ultima.test_ortopedici, '{}'::jsonb),
    COALESCE(v_ultima.test_rom,        '{}'::jsonb)
  )
  RETURNING id INTO v_nuova_id;

  RETURN v_nuova_id;
END;
$$;

-- Solo il ruolo authenticated (professionisti loggati) può chiamare questa funzione.
-- anon non ha accesso (i pazienti non creano visite).
REVOKE ALL ON FUNCTION duplica_visita_precedente(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION duplica_visita_precedente(uuid, uuid) TO authenticated;


-- ============================================================
-- F) COMMENTI DESCRITTIVI AGGIUNTIVI
-- ============================================================

COMMENT ON COLUMN visits.chiusa_at IS
  'Timestamp di chiusura della visita. NULL finché stato = bozza. '
  'Valorizzato dal frontend al click "Chiudi visita": '
  'UPDATE visits SET stato = ''chiusa'', chiusa_at = now() WHERE id = ...';

COMMENT ON COLUMN visits.durata_sintomi IS
  'Durata dei sintomi al momento della visita. Valori chip suggeriti: '
  'meno_1_sett | 1_4_sett | 1_3_mesi | piu_3_mesi | cronico. '
  'Colonna text libera: il frontend gestisce la UI a chip.';

COMMENT ON COLUMN visits.insorgenza IS
  'Modalità di insorgenza dei sintomi. Valori chip suggeriti: '
  'improvvisa | graduale | post_trauma | sconosciuta. '
  'Colonna text libera: il frontend gestisce la UI a chip.';

COMMENT ON COLUMN visits.ai_suggerimento_config IS
  'Suggerimento di configurazione protocollo generato dall''AI '
  'dopo l''analisi posturale. Valori: NPL | GPL | misto | NULL. '
  'NULL = analisi non ancora eseguita o non applicabile.';

COMMENT ON COLUMN visits.protocollo_assegnato_id IS
  'FK al protocollo paziente assegnato in questa visita (Step 4). '
  'NULL se la visita non include una nuova assegnazione di protocollo.';

COMMENT ON COLUMN visits.prossima_visita_at IS
  'Data e ora pianificata per la prossima visita (Step 5). '
  'Usata per generare promemoria e pre-popolare il calendario appuntamenti.';

COMMENT ON FUNCTION duplica_visita_precedente(uuid, uuid) IS
  'Crea una nuova visita bozza copiando anamnesi, diagnosi e test base '
  'dall''ultima visita CHIUSA del paziente. '
  'Restituisce l''UUID della nuova bozza, o NULL se nessuna visita precedente esiste. '
  'I campi NON duplicati: VAS, posturale, trattamento, rivalutazione, foto.';


-- ============================================================
-- QUERY DI VERIFICA
-- Esegui queste dopo la migrazione per confermare che tutto sia andato.
-- ============================================================

/*
-- 1. Verifica che le due tabelle esistano con il numero atteso di colonne
SELECT table_name, COUNT(*) AS num_colonne
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('visits', 'visit_photos')
GROUP BY table_name
ORDER BY table_name;
-- Atteso: visits = 35 colonne, visit_photos = 8 colonne

-- 2. Verifica indici creati
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('visits', 'visit_photos')
ORDER BY tablename, indexname;
-- Attesi: 6 indici su visits + 1 su visit_photos

-- 3. Verifica trigger
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'visits';
-- Atteso: visits_set_updated_at su BEFORE UPDATE

-- 4. Verifica RPC
SELECT proname, prosecdef
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE nspname = 'public'
  AND proname = 'duplica_visita_precedente';
-- Atteso: prosecdef = true

-- 5. Verifica check constraint su stato
INSERT INTO visits (patient_id, professional_id, stato)
VALUES (gen_random_uuid(), gen_random_uuid(), 'invalido');
-- Atteso: ERROR — new row violates check constraint "visits_stato_check"
-- (fai ROLLBACK dopo il test)

-- 6. Test RPC con paziente inesistente (nessuna visita precedente)
SELECT duplica_visita_precedente(gen_random_uuid(), gen_random_uuid());
-- Atteso: NULL (nessuna visita chiusa trovata, INSERT con tutti i campi NULL)
*/


-- ============================================================
-- ROW LEVEL SECURITY (NON ATTIVARE ORA — sarà migrazione 002)
-- ============================================================
-- Quando visita.html sarà testato e funzionante, eseguire
-- 002_enable_rls_visits.sql per attivare le policy su visits
-- e visit_photos, e contestualmente su tutte le tabelle legacy
-- (therapy_sessions, patients, ecc.) ancora prive di RLS.
--
-- Schema policy previsto (da implementare in 002):
--   visits:       authenticated può SELECT/INSERT/UPDATE/DELETE
--                 solo le visite dei propri pazienti
--                 (JOIN patients → professionals → user_id = auth.uid())
--   visit_photos: authenticated può gestire foto solo
--                 delle proprie visite
--   anon:         nessun accesso diretto (solo via RPC SECURITY DEFINER)
-- ============================================================
