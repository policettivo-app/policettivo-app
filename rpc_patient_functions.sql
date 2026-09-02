-- ============================================================
-- POLICETTIVO® — Secure RPC functions for anonymous patient access
-- Version: 2.0 (Security-hardened)
--
-- DEPLOYMENT ORDER:
--   1. Run this entire file in Supabase SQL Editor
--   2. Test every function with TEST_CHECKLIST_RPC.md
--   3. Only THEN enable RLS (uncomment block at the bottom)
--
-- SECURITY MODEL:
--   Every function is SECURITY DEFINER + SET search_path = public.
--   They run as the DB owner and intentionally bypass RLS because
--   anonymous patients carry no auth session — only an access_token.
--   Once RLS is active, these functions are the ONLY authorized path
--   for anon to reach patient data. Direct table access is blocked.
--
--   Gate: every function validates access_token before any query.
--   If the token is NULL, empty, or not found → silent empty result
--   (READ) or generic exception (WRITE). No oracle leakage.
--
--   Column discipline: no SELECT *, no row_to_json(), no %ROWTYPE
--   in return values. Every returned column is listed explicitly.
--   Adding a column to a table NEVER auto-exposes it here.
--
-- GRANT STRATEGY:
--   REVOKE ALL FROM PUBLIC before every GRANT so that no unexpected
--   role inherits execute permission. Only 'anon' is granted here.
--   Patient pages use the anon key (no JWT), so 'authenticated' is
--   intentionally excluded from these functions.
-- ============================================================


-- ============================================================
-- CLEANUP — drop old versions if they exist (handles return-type
-- changes that would make CREATE OR REPLACE fail).
-- ============================================================

DROP FUNCTION IF EXISTS get_patient_by_token(text);
DROP FUNCTION IF EXISTS get_protocol_data(text);
DROP FUNCTION IF EXISTS get_patient_sessions(text, text, int);
DROP FUNCTION IF EXISTS get_diary_entries(text, int);
DROP FUNCTION IF EXISTS save_diary_entry(text, jsonb);
DROP FUNCTION IF EXISTS save_therapy_session(text, jsonb);
DROP FUNCTION IF EXISTS update_session_feedback(text, uuid, text);
-- daily-context-v1
DROP FUNCTION IF EXISTS get_daily_context(text);
DROP FUNCTION IF EXISTS segna_messaggio_letto(text, uuid);


-- ============================================================
-- FUNCTION 1: get_patient_by_token
-- ============================================================
-- Purpose : Validate a patient token and return minimal identity.
--           Used by pagella.html to confirm the token is real
--           before loading diary data.
-- Tables  : READ patients
-- Returns : (nome, cognome) — 0 rows if token invalid/missing.
--           Never returns access_token, user_id, note_cliniche,
--           foto_url, foto_annotazioni, email, or telefono.
-- Mitigates:
--   • SELECT * on patients (old version exposed all clinical fields)
--   • access_token echo in response
--   • note_cliniche / professional internal fields leakage
--   • automatic future-column exposure (RETURNS SETOF patients)
-- ============================================================

CREATE FUNCTION get_patient_by_token(p_token text)
RETURNS TABLE(nome text, cognome text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pat.nome::text,
    pat.cognome::text
  FROM patients pat
  WHERE p_token IS NOT NULL
    AND p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND pat.access_token = p_token::uuid
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_patient_by_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_patient_by_token(text) TO anon;


-- ============================================================
-- FUNCTION 2: get_protocol_data
-- ============================================================
-- Purpose : Single-call load for patient exercise pages.
--           Returns patient identity, active protocol, ordered
--           exercise list, and custom videos — all in one JSONB.
--           Falls back to most-recent protocol if none is active
--           (callers that require active must check .protocol.stato).
-- Tables  : READ patients, patient_protocols,
--                patient_protocol_exercises, exercises,
--                exercise_videos
-- Returns : JSONB shape (all keys always present):
--   {
--     "patient":  { nome, cognome, configurazione_default },
--     "protocol": { id, stato, configurazione_generale,
--                   data_inizio, frequenza, nome_personalizzato }
--                 | null,
--     "exercises": [
--       { "ppe":      { id, exercise_id, ordine, durata, configurazione },
--         "exercise": { id, nome, descrizione_paziente, video_url,
--                       durata_default, slug } }
--     ],
--     "custom_videos": [
--       { id, titolo, url, tipo, descrizione, durata }
--     ]
--   }
-- Mitigates:
--   • row_to_json(v_patient) exposing access_token, user_id,
--     note_cliniche, foto_url, foto_annotazioni, email, telefono
--   • row_to_json(v_protocol) exposing internal planning fields
--   • row_to_json(ppe/ex/ev) exposing any internal/future columns
--   • ~6 sequential round-trips replaced by 1 RPC call
-- ============================================================

CREATE FUNCTION get_protocol_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token        uuid;
  v_patient_id   uuid;
  v_patient_nome text;
  v_patient_cog  text;
  v_patient_cfg  text;
  v_proto_id     uuid;
  v_proto_stato  text;
  v_proto_cfg    text;
  v_proto_inizio date;
  v_proto_freq   text;
  v_proto_nome   text;
  v_result       jsonb;
BEGIN
  -- Token guard: reject null / empty / whitespace tokens immediately
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Safe UUID cast: malformed token = null result, no exception to caller
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Resolve patient — single column fetch, no access_token in output
  SELECT id, nome, cognome, configurazione_default
    INTO v_patient_id, v_patient_nome, v_patient_cog, v_patient_cfg
    FROM patients
   WHERE access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve protocol: active first, fall back to most recent
  SELECT id, stato, configurazione_generale, data_inizio, frequenza, nome_personalizzato
    INTO v_proto_id, v_proto_stato, v_proto_cfg, v_proto_inizio, v_proto_freq, v_proto_nome
    FROM patient_protocols
   WHERE patient_id = v_patient_id
     AND stato = 'attivo'
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT id, stato, configurazione_generale, data_inizio, frequenza, nome_personalizzato
      INTO v_proto_id, v_proto_stato, v_proto_cfg, v_proto_inizio, v_proto_freq, v_proto_nome
      FROM patient_protocols
     WHERE patient_id = v_patient_id
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- No protocol at all
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'patient',       jsonb_build_object(
                         'nome',                  v_patient_nome,
                         'cognome',               v_patient_cog,
                         'configurazione_default', v_patient_cfg
                       ),
      'protocol',      NULL,
      'exercises',     '[]'::jsonb,
      'custom_videos', '[]'::jsonb,
      'elicoidali',    '[]'::jsonb
    );
  END IF;

  -- Build response with explicit column lists only
  SELECT jsonb_build_object(

    'patient', jsonb_build_object(
      'nome',                  v_patient_nome,
      'cognome',               v_patient_cog,
      'configurazione_default', v_patient_cfg
    ),

    'protocol', jsonb_build_object(
      'id',                   v_proto_id,
      'stato',                v_proto_stato,
      'configurazione_generale', v_proto_cfg,
      'data_inizio',          v_proto_inizio,
      'frequenza',            v_proto_freq,
      'nome_personalizzato',  v_proto_nome
    ),

    -- Exercises: only the fields the UI renders
    'exercises', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'ppe', jsonb_build_object(
            'id',           ppe.id,
            'exercise_id',  ppe.exercise_id,
            'ordine',       ppe.ordine,
            'durata',       ppe.durata,
            'configurazione', ppe.configurazione
          ),
          'exercise', jsonb_build_object(
            'id',                 ex.id,
            'nome',               ex.nome,
            'descrizione_paziente', ex.descrizione_paziente,
            'video_url',          ex.video_url,
            'durata_default',     ex.durata_default,
            'slug',               ex.slug
          )
        )
        ORDER BY ppe.ordine ASC NULLS LAST
      )
      FROM patient_protocol_exercises ppe
      LEFT JOIN exercises ex ON ex.id = ppe.exercise_id
      WHERE ppe.patient_protocol_id = v_proto_id
    ), '[]'::jsonb),

    -- Custom videos: only display fields, no internal references
    'custom_videos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          ev.id,
          'titolo',      ev.titolo,
          'url',         ev.url,
          'tipo',        ev.tipo,
          'descrizione', ev.descrizione,
          'durata',      ev.durata
        )
        ORDER BY ev.created_at ASC
      )
      FROM exercise_videos ev
      WHERE ev.protocol_id = v_proto_id
    ), '[]'::jsonb),

    -- Elicoidali: text-id exercises stored in separate table (no UUID FK)
    'elicoidali', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',            eli.id,
          'elicoidale_id', eli.elicoidale_id,
          'ordine',        eli.ordine,
          'durata',        eli.durata
        )
        ORDER BY eli.ordine ASC NULLS LAST
      )
      FROM patient_protocol_elicoidali eli
      WHERE eli.patient_protocol_id = v_proto_id
    ), '[]'::jsonb)

  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_protocol_data(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_protocol_data(text) TO anon;


-- ============================================================
-- FUNCTION 3: get_patient_sessions
-- ============================================================
-- Purpose : Fetch therapy sessions for the feedback card on
--           protocollo.html. Returns only the 2 fields the UI
--           reads: id (for the update call) and feedback_paziente
--           (to decide whether to show the feedback prompt).
-- Tables  : READ therapy_sessions (JOIN patients for token check)
-- Returns : TABLE(id, data_seduta, feedback_paziente)
--           p_limit is server-clamped to [1, 10]. Caller cannot
--           request more than 10 rows regardless of input.
--           p_from_date is validated; malformed values are ignored
--           (treated as NULL) rather than raising an error.
-- Mitigates:
--   • SELECT ts.* exposing professional clinical fields:
--     note_cliniche, tecniche, risposta_paziente, vas_inizio,
--     vas_fine, protocollo_seduta, protocollo_prossima,
--     professional_id — none visible to patients in the old version
--   • Unbounded p_limit allowing full history dump
--   • p_from_date cast error leaking DB internals via 500 response
--   • RETURNS SETOF therapy_sessions schema auto-exposure
-- ============================================================

CREATE FUNCTION get_patient_sessions(
  p_token     text,
  p_from_date text DEFAULT NULL,
  p_limit     int  DEFAULT 1
)
RETURNS TABLE(
  id               uuid,
  data_seduta      timestamptz,
  feedback_paziente text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token      uuid;
  v_patient_id uuid;
  v_from_ts    timestamptz;
  v_limit      int;
BEGIN
  -- Token guard
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RETURN;
  END IF;

  -- Safe UUID cast: malformed token = empty result, no exception to caller
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Clamp limit to prevent large result dumps: max 10 sessions
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 1), 10));

  -- Validate p_from_date gracefully: ignore if malformed
  IF p_from_date IS NOT NULL THEN
    BEGIN
      v_from_ts := p_from_date::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_from_ts := NULL;
    END;
  END IF;

  RETURN QUERY
  SELECT
    ts.id,
    ts.data_seduta,
    ts.feedback_paziente
  FROM therapy_sessions ts
  WHERE ts.patient_id = v_patient_id
    AND (v_from_ts IS NULL OR ts.data_seduta >= v_from_ts)
  ORDER BY ts.data_seduta DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION get_patient_sessions(text, text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_patient_sessions(text, text, int) TO anon;


-- ============================================================
-- FUNCTION 4: get_diary_entries
-- ============================================================
-- Purpose : Load diary history for streak/smile card
--           (protocollo.html), streak calculation (esercizio.html),
--           and full report card charts (pagella.html).
-- Tables  : READ diary_entries (JOIN patients for token check)
-- Returns : TABLE with all patient-authored fields.
--           p_limit is server-clamped to [1, 365].
--           Excludes: patient_id (implicit in token),
--                     patient_protocol_id (internal reference).
-- Mitigates:
--   • SELECT de.* exposing any future internal columns
--   • Unbounded p_limit allowing full diary dump
--   • RETURNS SETOF diary_entries schema auto-exposure
-- ============================================================

CREATE FUNCTION get_diary_entries(
  p_token text,
  p_limit int DEFAULT 30
)
RETURNS TABLE(
  id         uuid,
  data       date,
  completato boolean,
  dolore     int,
  rigidita   int,
  equilibrio int,
  energia    int,
  note       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token      uuid;
  v_patient_id uuid;
  v_limit      int;
BEGIN
  -- Token guard
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RETURN;
  END IF;

  -- Safe UUID cast: malformed token = empty result, no exception to caller
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Clamp limit: max 365 days of history
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 30), 365));

  RETURN QUERY
  SELECT
    de.id,
    de.data,
    de.completato,
    de.dolore,
    de.rigidita,
    de.equilibrio,
    de.energia,
    de.note
  FROM diary_entries de
  WHERE de.patient_id = v_patient_id
  ORDER BY de.data DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION get_diary_entries(text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_diary_entries(text, int) TO anon;


-- ============================================================
-- FUNCTION 5: save_diary_entry
-- ============================================================
-- Purpose : Insert a diary entry from patient-facing pages
--           (protocollo.html salvaDiario, esercizio.html
--           salvaDiarioAutomatico/painAlert, rapida.html
--           completaSeduta/saltaECompleta).
-- Tables  : READ patients (token check), patient_protocols
--                (ownership check on patient_protocol_id)
--           WRITE diary_entries
-- Returns : uuid of the new entry, or raises exception on failure.
-- Mitigates:
--   • patient_protocol_id not validated (old version allowed
--     cross-patient protocol injection, corrupting clinical data)
--   • Unbounded note text (payload bombing → DB storage abuse)
--   • data not bounded (arbitrary past/future date injection)
-- ============================================================

CREATE FUNCTION save_diary_entry(p_token text, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token       uuid;
  v_patient_id  uuid;
  v_protocol_id uuid;
  v_entry_date  date;
  v_new_id      uuid;
  -- Declared separately so each cast can fail independently
  v_dolore      int     := 0;
  v_rigidita    int     := 0;
  v_equilibrio  int     := 5;
  v_energia     int     := 5;
  v_completato  boolean := false;
  -- daily-context-v1 — i campi della 036 e della 041
  v_modalita    text;
  v_risposta    text;
  v_difficolta  text;
  v_interrotto  boolean := false;
  v_stelle      smallint;
  v_versione    integer;
  v_iniziata    timestamptz;
  v_finita      timestamptz;
  v_esercizi    jsonb;
  v_video       jsonb;
  v_sessione    text;
  v_tipo        text;
  v_zona        text;
  v_attivita    text;
  v_cuscini     boolean;
BEGIN
  -- Token guard
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Safe UUID cast: malformed token = same response as token not found
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Validate patient_protocol_id ownership.
  -- NULL is allowed (pain-alert entries have no protocol reference).
  IF p_data->>'patient_protocol_id' IS NOT NULL THEN
    v_protocol_id := (p_data->>'patient_protocol_id')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM patient_protocols pp
       WHERE pp.id         = v_protocol_id
         AND pp.patient_id = v_patient_id
    ) THEN
      RAISE EXCEPTION 'Operazione non autorizzata';
    END IF;
  END IF;

  -- Safe date cast: malformed input falls back to today
  BEGIN
    v_entry_date := (p_data->>'data')::date;
  EXCEPTION WHEN OTHERS THEN
    v_entry_date := CURRENT_DATE;
  END;

  IF v_entry_date IS NULL OR v_entry_date > CURRENT_DATE + INTERVAL '1 day' THEN
    v_entry_date := CURRENT_DATE;
  END IF;

  -- Safe integer casts: non-numeric input falls back to field default
  BEGIN v_dolore     := (p_data->>'dolore')::int;     EXCEPTION WHEN OTHERS THEN v_dolore     := 0; END;
  BEGIN v_rigidita   := (p_data->>'rigidita')::int;   EXCEPTION WHEN OTHERS THEN v_rigidita   := 0; END;
  BEGIN v_equilibrio := (p_data->>'equilibrio')::int; EXCEPTION WHEN OTHERS THEN v_equilibrio := 5; END;
  BEGIN v_energia    := (p_data->>'energia')::int;    EXCEPTION WHEN OTHERS THEN v_energia    := 5; END;

  -- Safe boolean cast: anything non-boolean falls back to false
  BEGIN v_completato := (p_data->>'completato')::boolean; EXCEPTION WHEN OTHERS THEN v_completato := false; END;

  -- ==================================================================
  -- daily-context-v1 — I CAMPI DELLA SEDUTA (migration 036 e 041)
  -- ==================================================================
  -- Le colonne c'erano dal 29 agosto e nessuno le scriveva: la home non
  -- ha mai avuto niente a cui reagire. Da qui in poi ce l'ha.
  --
  -- LA REGOLA, UGUALE PER TUTTI I CAMPI NUOVI: un valore che non va bene
  -- diventa NULL, non un errore. Una seduta di un paziente non si ferma
  -- mai per un campo di misura scritto storto. Vale gia' cosi' per
  -- log_patient_event nella 036, ed e' la stessa ragione.

  v_modalita := NULLIF(LOWER(TRIM(COALESCE(p_data->>'modalita', ''))), '');
  IF v_modalita IS NOT NULL AND v_modalita NOT IN ('rapid','guided','manual') THEN
    v_modalita := NULL;
  END IF;

  -- risposta_post e' la risposta PERCEPITA alla seduta (better/same/worse).
  -- Non e' la stessa cosa delle stelle, che sono la soddisfazione: la 036
  -- dice esplicitamente di non mescolarle mai.
  v_risposta := NULLIF(LOWER(TRIM(COALESCE(p_data->>'risposta_post', ''))), '');
  IF v_risposta IS NOT NULL AND v_risposta NOT IN ('better','same','worse') THEN
    v_risposta := NULL;
  END IF;

  v_difficolta := NULLIF(LOWER(TRIM(COALESCE(p_data->>'difficolta', ''))), '');
  IF v_difficolta IS NOT NULL AND v_difficolta NOT IN ('easy','normal','difficult') THEN
    v_difficolta := NULL;
  END IF;

  BEGIN v_interrotto := (p_data->>'interrotto_per_dolore')::boolean; EXCEPTION WHEN OTHERS THEN v_interrotto := false; END;
  v_interrotto := COALESCE(v_interrotto, false);

  BEGIN v_stelle := (p_data->>'stelle')::smallint; EXCEPTION WHEN OTHERS THEN v_stelle := NULL; END;
  IF v_stelle IS NOT NULL AND (v_stelle < 1 OR v_stelle > 5) THEN v_stelle := NULL; END IF;

  BEGIN v_iniziata := (p_data->>'iniziata_alle')::timestamptz; EXCEPTION WHEN OTHERS THEN v_iniziata := NULL; END;
  BEGIN v_finita   := (p_data->>'finita_alle')::timestamptz;   EXCEPTION WHEN OTHERS THEN v_finita   := NULL; END;
  -- Un orario nel futuro e' un orologio sbagliato, non un dato. E una
  -- seduta non puo' finire prima di essere cominciata: se il telefono
  -- dice cosi', si tiene l'inizio e si butta la fine.
  IF v_iniziata IS NOT NULL AND v_iniziata > now() + INTERVAL '1 hour' THEN v_iniziata := NULL; END IF;
  IF v_finita   IS NOT NULL AND v_finita   > now() + INTERVAL '1 hour' THEN v_finita   := NULL; END IF;
  IF v_iniziata IS NOT NULL AND v_finita IS NOT NULL AND v_finita < v_iniziata THEN v_finita := NULL; END IF;

  -- Gli elenchi di cosa e' stato fatto: solo se sono davvero elenchi, e
  -- con un tetto alla dimensione (nessun payload bombing).
  v_esercizi := p_data->'esercizi_completati';
  IF v_esercizi IS NOT NULL AND (jsonb_typeof(v_esercizi) NOT IN ('array','object')
                                 OR LENGTH(v_esercizi::text) > 4000) THEN
    v_esercizi := NULL;
  END IF;

  v_video := p_data->'video_visti';
  IF v_video IS NOT NULL AND (jsonb_typeof(v_video) NOT IN ('array','object')
                              OR LENGTH(v_video::text) > 4000) THEN
    v_video := NULL;
  END IF;

  -- La chiave che tiene UNA sola riga per seduta. Forma obbligata: cosi'
  -- un browser non puo' inventarsi una chiave lunga un chilometro.
  v_sessione := NULLIF(TRIM(COALESCE(p_data->>'client_session_id', '')), '');
  IF v_sessione IS NOT NULL AND v_sessione !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    v_sessione := NULL;
  END IF;

  -- session_type: se non lo dicono, e' la seduta prescritta. E' il default
  -- perche' e' la prima azione della home, e le routine libere sono un
  -- servizio secondario (decisione di Giuliano, 2 settembre).
  v_tipo := NULLIF(LOWER(TRIM(COALESCE(p_data->>'session_type', ''))), '');
  IF v_tipo IS NULL OR v_tipo NOT IN ('main','routine') THEN v_tipo := 'main'; END IF;

  v_zona := NULLIF(LOWER(TRIM(COALESCE(p_data->>'body_area', ''))), '');
  IF v_zona IS NOT NULL AND v_zona !~ '^[a-z][a-z0-9_]{1,39}$' THEN v_zona := NULL; END IF;

  v_attivita := NULLIF(LOWER(TRIM(COALESCE(p_data->>'activity_type', ''))), '');
  IF v_attivita IS NOT NULL AND v_attivita !~ '^[a-z][a-z0-9_]{1,39}$' THEN v_attivita := NULL; END IF;

  BEGIN v_cuscini := (p_data->>'with_cushions')::boolean; EXCEPTION WHEN OTHERS THEN v_cuscini := NULL; END;

  -- La versione del protocollo NON arriva dal browser: la si legge qui.
  -- Serve a sapere, guardando due sedute lontane, se in mezzo il
  -- programma era cambiato.
  IF v_protocol_id IS NOT NULL THEN
    BEGIN
      SELECT pp.versione INTO v_versione FROM patient_protocols pp WHERE pp.id = v_protocol_id;
    EXCEPTION WHEN undefined_column THEN
      -- migration 041 non lanciata: si continua senza, non si rompe niente
      v_versione := NULL;
    END;
  END IF;

  INSERT INTO diary_entries (
    patient_id,
    patient_protocol_id,
    data,
    dolore,
    rigidita,
    equilibrio,
    energia,
    note,
    completato,
    modalita,
    risposta_post,
    interrotto_per_dolore,
    difficolta,
    stelle,
    protocol_version,
    iniziata_alle,
    finita_alle,
    esercizi_completati,
    video_visti,
    client_session_id,
    session_type,
    body_area,
    activity_type,
    with_cushions
  ) VALUES (
    v_patient_id,
    v_protocol_id,
    v_entry_date,
    -- Clamp to [0, 10] after safe cast
    GREATEST(0, LEAST(COALESCE(v_dolore,     0), 10)),
    GREATEST(0, LEAST(COALESCE(v_rigidita,   0), 10)),
    GREATEST(0, LEAST(COALESCE(v_equilibrio, 5), 10)),
    GREATEST(0, LEAST(COALESCE(v_energia,    5), 10)),
    LEFT(p_data->>'note', 2000),
    COALESCE(v_completato, false),
    v_modalita,
    v_risposta,
    v_interrotto,
    v_difficolta,
    v_stelle,
    v_versione,
    v_iniziata,
    v_finita,
    v_esercizi,
    v_video,
    v_sessione,
    v_tipo,
    v_zona,
    v_attivita,
    v_cuscini
  )
  -- ANTI DOPPIO-CLICK, ANTI REFRESH, ANTI «ho riaperto la pagina».
  -- L'indice univoco parziale della 036 vale solo dove client_session_id
  -- non e' nullo: qui si dichiara lo stesso filtro, se no PostgreSQL non
  -- sa quale indice guardare. Senza questo, il secondo salvataggio della
  -- STESSA seduta non dava un doppione: dava un errore in faccia al
  -- paziente a fine seduta.
  ON CONFLICT (patient_id, client_session_id) WHERE client_session_id IS NOT NULL
  DO UPDATE SET
    patient_protocol_id   = COALESCE(EXCLUDED.patient_protocol_id, diary_entries.patient_protocol_id),
    dolore                = EXCLUDED.dolore,
    rigidita              = EXCLUDED.rigidita,
    equilibrio            = EXCLUDED.equilibrio,
    energia               = EXCLUDED.energia,
    note                  = COALESCE(EXCLUDED.note, diary_entries.note),
    -- Una seduta fatta non torna «non fatta», e un'interruzione per
    -- dolore non si cancella con un secondo salvataggio: sono due cose
    -- successe davvero, e un salvataggio dopo non le disfa.
    completato            = diary_entries.completato OR EXCLUDED.completato,
    interrotto_per_dolore = diary_entries.interrotto_per_dolore OR EXCLUDED.interrotto_per_dolore,
    modalita              = COALESCE(EXCLUDED.modalita,      diary_entries.modalita),
    risposta_post         = COALESCE(EXCLUDED.risposta_post, diary_entries.risposta_post),
    difficolta            = COALESCE(EXCLUDED.difficolta,    diary_entries.difficolta),
    stelle                = COALESCE(EXCLUDED.stelle,        diary_entries.stelle),
    protocol_version      = COALESCE(EXCLUDED.protocol_version, diary_entries.protocol_version),
    iniziata_alle         = COALESCE(diary_entries.iniziata_alle, EXCLUDED.iniziata_alle),
    finita_alle           = COALESCE(EXCLUDED.finita_alle,   diary_entries.finita_alle),
    esercizi_completati   = COALESCE(EXCLUDED.esercizi_completati, diary_entries.esercizi_completati),
    video_visti           = COALESCE(EXCLUDED.video_visti,   diary_entries.video_visti),
    session_type          = COALESCE(EXCLUDED.session_type,  diary_entries.session_type),
    body_area             = COALESCE(EXCLUDED.body_area,     diary_entries.body_area),
    activity_type         = COALESCE(EXCLUDED.activity_type, diary_entries.activity_type),
    with_cushions         = COALESCE(EXCLUDED.with_cushions, diary_entries.with_cushions)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION save_diary_entry(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION save_diary_entry(text, jsonb) TO anon;


-- ============================================================
-- FUNCTION 6: save_therapy_session
-- ============================================================
-- Purpose : Create a therapy session record when the patient
--           submits star-feedback and no professional session
--           exists for today (protocollo.html → salvaFeedback).
--           Prevents duplicate creation: if a session already
--           exists for today for this patient, returns its id
--           instead of inserting a new one.
-- Tables  : READ patients (token check), therapy_sessions
--                (deduplication check)
--           WRITE therapy_sessions
-- Returns : uuid of the new or existing session.
-- Mitigates:
--   • Infinite fake session creation (old version: no dedup,
--     patient could flood the professional's clinical timeline)
--   • Unbounded feedback text (payload bombing)
-- ============================================================

CREATE FUNCTION save_therapy_session(p_token text, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token       uuid;
  v_patient_id  uuid;
  v_session_id  uuid;
  v_data_seduta timestamptz;
BEGIN
  -- Token guard
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Safe UUID cast: malformed token = same response as token not found
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Safe timestamptz cast: malformed or missing input falls back to now()
  BEGIN
    v_data_seduta := (p_data->>'data_seduta')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_data_seduta := now();
  END;

  IF v_data_seduta IS NULL THEN
    v_data_seduta := now();
  END IF;

  -- Deduplication: if a session already exists today for this patient,
  -- return its id rather than inserting a duplicate.
  SELECT id INTO v_session_id
    FROM therapy_sessions
   WHERE patient_id = v_patient_id
     AND DATE(data_seduta AT TIME ZONE 'UTC') = CURRENT_DATE
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN v_session_id;
  END IF;

  -- Insert new session with only patient-safe fields
  INSERT INTO therapy_sessions (patient_id, data_seduta, feedback_paziente)
  VALUES (
    v_patient_id,
    v_data_seduta,
    LEFT(p_data->>'feedback_paziente', 2000)
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION save_therapy_session(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION save_therapy_session(text, jsonb) TO anon;


-- ============================================================
-- FUNCTION 7: update_session_feedback
-- ============================================================
-- Purpose : Update the patient's feedback text on an existing
--           therapy session. The WHERE clause enforces that the
--           session belongs to the patient identified by the
--           token — cross-patient modification is impossible.
-- Tables  : READ patients (token check)
--           WRITE therapy_sessions (only feedback_paziente column,
--                only rows owned by the token-validated patient)
-- Returns : true if the row was updated, false if session not
--           found (or not owned by this patient).
-- Mitigates:
--   • Modification of sessions belonging to other patients
--     (WHERE id = ... AND patient_id = ... prevents this)
--   • Unbounded feedback text (payload bombing)
-- ============================================================

CREATE FUNCTION update_session_feedback(
  p_token      text,
  p_session_id uuid,
  p_feedback   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token      uuid;
  v_patient_id uuid;
BEGIN
  -- Token guard
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Safe UUID cast: malformed token = same response as token not found
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;

  -- Update is constrained to rows owned by this patient.
  -- A session belonging to another patient will match 0 rows →
  -- FOUND = false → returns false, no error, no data leak.
  UPDATE therapy_sessions
     SET feedback_paziente = LEFT(p_feedback, 2000)
   WHERE id         = p_session_id
     AND patient_id = v_patient_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_session_feedback(text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_session_feedback(text, uuid, text) TO anon;


-- ============================================================
-- FUNCTION 8: get_daily_context            [daily-context-v1]
-- ============================================================
-- Purpose : Tutto quello che la home del paziente deve sapere per
--           aprirsi giusta, in UNA sola chiamata: in che stato e' il
--           paziente oggi, cosa e' successo ieri, con che modalita'
--           ha lavorato l'ultima volta, se il professionista gli ha
--           lasciato un messaggio, quando e' stato aggiornato il
--           programma.
--
-- ⚠️ QUESTA FUNZIONE NON SCRIVE UNA SOLA PAROLA RIVOLTA AL PAZIENTE.
--    Restituisce CHIAVI ('dolore_ieri', 'in_pausa'), non frasi. Le
--    parole che il paziente legge stanno in un file solo, riletto da
--    Giuliano, come le osservazioni e le terapie. Se le frasi stessero
--    qui dentro, per correggere una parola servirebbe una migration -
--    e prima o poi due punti direbbero due cose diverse.
--
-- ⚠️ UNA SOLA REAZIONE, MAI CINQUE AVVISI INSIEME.
--    'reazione' e' una chiave sola, scelta per priorita'. E' la regola
--    che impedisce a questa funzione di diventare rumore.
--
-- ⚠️ NESSUN GIUDIZIO CLINICO. Qui dentro non si dice mai «stai meglio»
--    ne' «la terapia funziona»: si riporta solo quello che il paziente
--    HA RIFERITO, e la home lo ripete con le sue parole.
--
-- Tables  : READ patients, patient_protocols, diary_entries,
--                patient_messages
-- Returns : JSONB (tutte le chiavi sempre presenti), oppure NULL se il
--           token non e' valido - stessa risposta di get_protocol_data,
--           nessun oracolo sull'esistenza del paziente.
--
-- Se la migration 041 non e' stata lanciata la funzione NON fallisce:
-- restituisce quello che puo' e mette il nome del file mancante in
-- 'manca_sql', che la pagina fa vedere a schermo (lezione: una
-- migration non lanciata non deve produrre un guasto muto).
-- ============================================================

CREATE FUNCTION get_daily_context(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token        uuid;
  v_patient_id   uuid;
  v_nome         text;
  v_proto        record;
  -- Ieri e il messaggio NON sono record: le loro SELECT stanno dentro un
  -- blocco che puo' saltare (migration 041 non lanciata), e un record che
  -- non e' mai stato assegnato esplode alla prima volta che lo si legge.
  -- Con le variabili semplici restano NULL, che e' esattamente cio' che
  -- si vuole dire.
  v_ieri_data    date;
  v_ieri_compl   boolean;
  v_ieri_dolore  int;
  v_ieri_stop    boolean;
  v_ieri_risp    text;
  v_ieri_mod     text;
  v_msg_id       uuid;
  v_msg_testo    text;
  v_msg_audio    text;
  v_msg_autore   text;
  v_msg_creato   timestamptz;
  v_msg_letto    timestamptz;
  v_oggi_fatto   boolean := false;
  v_ultima_mod   text;
  v_ultima_data  date;
  v_giorni       int;
  v_streak       int := 0;
  v_giorno       date;
  v_main_sett    int := 0;
  v_routine_sett int := 0;
  v_stelle_sett  boolean := false;
  v_stato        text;
  v_reazione     text;
  v_manca        text := NULL;
  v_aggiornato   timestamptz;
  v_versione     int;
BEGIN
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  SELECT pat.id, pat.nome INTO v_patient_id, v_nome
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ---- Il protocollo: attivo per primo, se no il piu' recente.
  -- Stessa scelta di get_protocol_data: due punti che scelgono il
  -- protocollo in modo diverso prima o poi divergono.
  SELECT pp.id, pp.stato, pp.data_inizio, pp.data_fine, pp.frequenza,
         pp.nome_personalizzato, pp.created_at
    INTO v_proto
    FROM patient_protocols pp
   WHERE pp.patient_id = v_patient_id
     AND pp.stato = 'attivo'
   ORDER BY pp.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT pp.id, pp.stato, pp.data_inizio, pp.data_fine, pp.frequenza,
           pp.nome_personalizzato, pp.created_at
      INTO v_proto
      FROM patient_protocols pp
     WHERE pp.patient_id = v_patient_id
     ORDER BY pp.created_at DESC
     LIMIT 1;
  END IF;

  -- updated_at e versione arrivano dalla 041. Se non c'e', si mostra
  -- created_at: la data piu' vera che si sappia, mai una inventata.
  IF v_proto.id IS NOT NULL THEN
    BEGIN
      SELECT pp.updated_at, pp.versione INTO v_aggiornato, v_versione
        FROM patient_protocols pp WHERE pp.id = v_proto.id;
    EXCEPTION WHEN undefined_column THEN
      v_manca := 'db/migrations/041_daily_context.sql';
    END;
    v_aggiornato := COALESCE(v_aggiornato, v_proto.created_at);
  END IF;

  -- ---- I CINQUE STATI, in quest'ordine.
  -- L'ordine e' la funzione: un protocollo sospeso resta sospeso anche
  -- se il paziente ha fatto qualcosa oggi.
  IF v_proto.id IS NULL THEN
    v_stato := 'nessun_protocollo';
  ELSIF v_proto.stato IS DISTINCT FROM 'attivo' THEN
    v_stato := 'in_pausa';
  ELSIF v_proto.data_fine IS NOT NULL AND v_proto.data_fine < CURRENT_DATE THEN
    v_stato := 'protocollo_finito';
  END IF;

  -- ---- Ieri, e la seduta di oggi.
  -- session_type arriva dalla 041: se manca, si contano tutte le righe
  -- come se fossero sedute del protocollo, che e' quello che erano.
  BEGIN
    SELECT (de.data = CURRENT_DATE) INTO v_oggi_fatto
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.data = CURRENT_DATE
       AND de.completato = true
       AND COALESCE(de.session_type, 'main') = 'main'
     LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_manca := 'db/migrations/041_daily_context.sql';
    SELECT true INTO v_oggi_fatto
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.data = CURRENT_DATE
       AND de.completato = true
     LIMIT 1;
  END;
  v_oggi_fatto := COALESCE(v_oggi_fatto, false);

  IF v_stato IS NULL THEN
    v_stato := CASE WHEN v_oggi_fatto THEN 'gia_fatto_oggi' ELSE 'da_fare' END;
  END IF;

  -- La riga di ieri. Non «l'ultima riga»: ieri. La home dice «ieri hai
  -- riferito...», e una riga di tre giorni fa spacciata per ieri
  -- sarebbe una data scritta a caso.
  BEGIN
    SELECT de.data, de.completato, de.interrotto_per_dolore, de.risposta_post,
           de.dolore, de.modalita
      INTO v_ieri_data, v_ieri_compl, v_ieri_stop, v_ieri_risp,
           v_ieri_dolore, v_ieri_mod
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.data = CURRENT_DATE - 1
     ORDER BY de.created_at DESC NULLS LAST
     LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_manca := 'db/migrations/041_daily_context.sql';
  END;

  -- Ultima modalita' usata: serve al pulsante unico INIZIA, che riparte
  -- come l'ultima volta invece di far scegliere ogni mattina.
  BEGIN
    SELECT de.modalita, de.data INTO v_ultima_mod, v_ultima_data
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.modalita IN ('rapid','guided')
     ORDER BY de.data DESC, de.created_at DESC NULLS LAST
     LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_manca := 'db/migrations/041_daily_context.sql';
  END;

  -- Da quanti giorni non fa una seduta (completata).
  SELECT MAX(de.data) INTO v_ultima_data
    FROM diary_entries de
   WHERE de.patient_id = v_patient_id
     AND de.completato = true;
  IF v_ultima_data IS NOT NULL THEN
    v_giorni := CURRENT_DATE - v_ultima_data;
  END IF;

  -- Striscia di giorni consecutivi. Si guarda indietro al massimo 60
  -- giorni: oltre non serve a nessuno e un ciclo senza fondo su una
  -- tabella di un paziente qualsiasi non si scrive.
  v_giorno := CASE WHEN v_oggi_fatto THEN CURRENT_DATE ELSE CURRENT_DATE - 1 END;
  WHILE v_streak < 60 LOOP
    IF EXISTS (SELECT 1 FROM diary_entries de
                WHERE de.patient_id = v_patient_id
                  AND de.data = v_giorno
                  AND de.completato = true) THEN
      v_streak := v_streak + 1;
      v_giorno := v_giorno - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Questa settimana (ultimi 7 giorni). main e routine si contano
  -- SEPARATE: una routine breve scelta dal paziente non e' la seduta
  -- prescritta, e sommarle farebbe dire all'aderenza cose che non sono.
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(de.session_type,'main') = 'main'),
      COUNT(*) FILTER (WHERE de.session_type = 'routine'),
      BOOL_OR(de.stelle IS NOT NULL)
      INTO v_main_sett, v_routine_sett, v_stelle_sett
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.completato = true
       AND de.data > CURRENT_DATE - 7;
  EXCEPTION WHEN undefined_column THEN
    v_manca := 'db/migrations/041_daily_context.sql';
    SELECT COUNT(*), 0, false INTO v_main_sett, v_routine_sett, v_stelle_sett
      FROM diary_entries de
     WHERE de.patient_id = v_patient_id
       AND de.completato = true
       AND de.data > CURRENT_DATE - 7;
  END;

  -- ---- IL MESSAGGIO DEL PROFESSIONISTA
  BEGIN
    SELECT pm.id, pm.testo, pm.audio_url, pm.autore, pm.creato_il, pm.letto_il
      INTO v_msg_id, v_msg_testo, v_msg_audio, v_msg_autore, v_msg_creato, v_msg_letto
      FROM patient_messages pm
     WHERE pm.patient_id = v_patient_id
       AND pm.archiviato = false
     ORDER BY pm.creato_il DESC
     LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_manca := 'db/migrations/041_daily_context.sql';
  END;

  -- ---- LA REAZIONE: UNA SOLA, PER PRIORITA'
  -- Prima quello che fa male, poi quello che va storto, poi l'assenza,
  -- e solo alla fine la lode. Se domani se ne aggiunge una, si aggiunge
  -- QUI: e' l'unico punto dove l'ordine e' scritto.
  IF COALESCE(v_ieri_stop, false) THEN
    v_reazione := 'dolore_ieri';
  ELSIF v_ieri_risp = 'worse' THEN
    v_reazione := 'peggio_ieri';
  ELSIF v_ieri_data IS NOT NULL AND v_ieri_compl = false THEN
    v_reazione := 'ieri_non_finita';
  ELSIF v_giorni IS NOT NULL AND v_giorni >= 3 THEN
    v_reazione := 'assente_da_un_po';
  ELSIF v_streak >= 3 THEN
    v_reazione := 'costanza';
  END IF;

  RETURN jsonb_build_object(
    'oggi',            CURRENT_DATE,
    'nome',            v_nome,
    'stato',           v_stato,

    'protocollo', CASE WHEN v_proto.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',            v_proto.id,
      'stato',         v_proto.stato,
      'nome',          v_proto.nome_personalizzato,
      'data_inizio',   v_proto.data_inizio,
      'data_fine',     v_proto.data_fine,
      'frequenza',     v_proto.frequenza,
      'versione',      v_versione,
      'aggiornato_il', v_aggiornato
    ) END,

    'ultima_modalita', v_ultima_mod,

    'ieri', CASE WHEN v_ieri_data IS NULL THEN NULL ELSE jsonb_build_object(
      'data',                  v_ieri_data,
      'completato',            v_ieri_compl,
      'interrotto_per_dolore', v_ieri_stop,
      'risposta_post',         v_ieri_risp,
      'dolore',                v_ieri_dolore,
      'modalita',              v_ieri_mod
    ) END,

    'reazione',                v_reazione,
    'giorni_da_ultima_seduta', v_giorni,
    'streak',                  v_streak,

    'settimana', jsonb_build_object(
      'main',    COALESCE(v_main_sett, 0),
      'routine', COALESCE(v_routine_sett, 0)
    ),

    -- Le stelle si chiedono UNA VOLTA A SETTIMANA (036), non ogni
    -- giorno: un dato chiesto tutti i giorni smette di essere
    -- compilato dopo due settimane.
    'chiedi_stelle', (NOT COALESCE(v_stelle_sett, false)) AND COALESCE(v_main_sett, 0) > 0,

    'messaggio', CASE WHEN v_msg_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',        v_msg_id,
      'testo',     v_msg_testo,
      'audio_url', v_msg_audio,
      'autore',    v_msg_autore,
      'creato_il', v_msg_creato,
      'letto_il',  v_msg_letto
    ) END,

    'manca_sql', v_manca
  );
END;
$$;

REVOKE ALL ON FUNCTION get_daily_context(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_daily_context(text) TO anon;


-- ============================================================
-- FUNCTION 9: segna_messaggio_letto        [daily-context-v1]
-- ============================================================
-- Purpose : Il paziente ha aperto il messaggio del professionista.
--           Serve al professionista per sapere se e' arrivato.
-- Returns : true se ha segnato qualcosa, false se il messaggio non
--           esiste o non e' suo. Mai un errore: se questa cosa non
--           funziona, il paziente non se ne deve accorgere.
--
-- ⚠️ Scrive SOLO letto_il, e solo se e' ancora nullo: la prima volta
--    e' l'unica che conta, e un refresh non deve spostare la data.
--    Nient'altro di questa tabella e' scrivibile dal token.
-- ============================================================

CREATE FUNCTION segna_messaggio_letto(p_token text, p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token      uuid;
  v_patient_id uuid;
BEGIN
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 OR p_message_id IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  SELECT pat.id INTO v_patient_id
    FROM patients pat
   WHERE pat.access_token = v_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Il WHERE fa da permesso: un messaggio di un altro paziente non
  -- trova nessuna riga, quindi false. Nessun errore, nessuna fuga.
  UPDATE patient_messages
     SET letto_il = now()
   WHERE id         = p_message_id
     AND patient_id = v_patient_id
     AND letto_il IS NULL;

  RETURN FOUND;
EXCEPTION WHEN undefined_table THEN
  -- migration 041 non lanciata
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION segna_messaggio_letto(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION segna_messaggio_letto(text, uuid) TO anon;


-- ============================================================
-- VERIFICATION QUERIES
-- Run these immediately after deployment to confirm the
-- functions exist with the correct owner and no PUBLIC grant.
-- ============================================================

/*
SELECT
  p.proname                            AS function_name,
  pg_get_userbyid(p.proowner)          AS owner,
  p.prosecdef                          AS security_definer,
  p.proconfig                          AS config  -- should include search_path=public
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_patient_by_token',
    'get_protocol_data',
    'get_patient_sessions',
    'get_diary_entries',
    'save_diary_entry',
    'save_therapy_session',
    'update_session_feedback',
    'get_daily_context',
    'segna_messaggio_letto'
  )
ORDER BY p.proname;

-- Expected: all rows show prosecdef = true, config contains search_path=public

-- Confirm only 'anon' has EXECUTE (no 'public' entry):
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN (
  'get_patient_by_token',
  'get_protocol_data',
  'get_patient_sessions',
  'get_diary_entries',
  'save_diary_entry',
  'save_therapy_session',
  'update_session_feedback',
  'get_daily_context',
  'segna_messaggio_letto'
)
ORDER BY routine_name, grantee;
-- Expected: only 'anon' appears for each function.
*/


-- ============================================================
-- RLS ACTIVATION — DO NOT RUN until ALL frontend tests pass.
-- Remove the /* */ block delimiters when ready.
-- After this runs, anon can no longer reach any table directly.
-- All patient access flows through the RPC functions above.
-- ============================================================

/*
-- Step 1: Enable RLS on all patient-data tables
ALTER TABLE patients                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_protocols          ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_protocol_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_videos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapy_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries              ENABLE ROW LEVEL SECURITY;

-- Step 2: Professionals can manage their own patients.
-- patients.professional_id references professionals.id directly.
-- The logged-in user is identified via professionals.user_id = auth.uid().
CREATE POLICY "prof_own_patients" ON patients
  FOR ALL
  TO authenticated
  USING (
    professional_id = (
      SELECT pr.id FROM professionals pr
       WHERE pr.user_id = auth.uid()
       LIMIT 1
    )
  );

CREATE POLICY "prof_own_protocols" ON patient_protocols
  FOR ALL
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM patients p
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

CREATE POLICY "prof_own_protocol_exercises" ON patient_protocol_exercises
  FOR ALL
  TO authenticated
  USING (
    patient_protocol_id IN (
      SELECT pp.id FROM patient_protocols pp
      JOIN patients p ON p.id = pp.patient_id
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

CREATE POLICY "prof_own_sessions" ON therapy_sessions
  FOR ALL
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM patients p
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

CREATE POLICY "prof_own_diary" ON diary_entries
  FOR ALL
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM patients p
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

CREATE POLICY "prof_own_exercise_videos" ON exercise_videos
  FOR ALL
  TO authenticated
  USING (
    protocol_id IN (
      SELECT pp.id FROM patient_protocols pp
      JOIN patients p ON p.id = pp.patient_id
      JOIN professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

-- exercises is read-only reference data shared across all professionals.
CREATE POLICY "authenticated_read_exercises" ON exercises
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 3: No anon policies = anon gets 0 rows on all tables.
-- Patient access is exclusively via SECURITY DEFINER RPCs above.

-- Step 4: After enabling RLS, run the security verification:
-- curl -s "https://<project>.supabase.co/rest/v1/patients?select=id&limit=1" \
--   -H "apikey: <anon_key>" | jq .
-- Expected result: [] (empty array, not patient data)
*/
