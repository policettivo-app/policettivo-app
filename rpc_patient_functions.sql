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

  INSERT INTO diary_entries (
    patient_id,
    patient_protocol_id,
    data,
    dolore,
    rigidita,
    equilibrio,
    energia,
    note,
    completato
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
    COALESCE(v_completato, false)
  )
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
    'update_session_feedback'
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
  'update_session_feedback'
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
