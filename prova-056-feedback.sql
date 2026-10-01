-- prova-056-feedback.sql · 056-feedback-v1 · PostgreSQL locale (sandbox), mai in Supabase
-- psql -f prova-056-feedback.sql  (dalla radice del repo)
drop schema public cascade; create schema public;
create table public.sql_backup(id serial, oggetto text, definizione text, blocco text, salvato_il timestamptz default clock_timestamp());
create table public.patients(id uuid primary key default gen_random_uuid(), access_token uuid);
create table public.therapy_sessions(id uuid primary key default gen_random_uuid(), patient_id uuid, data_seduta timestamptz, created_at timestamptz default now(),
 feedback_paziente_benessere integer, feedback_paziente_esercizi text, feedback_paziente_note text);
insert into patients values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
-- definizioni VIVE del 1 ott (prima della 056)
CREATE OR REPLACE FUNCTION public.get_patient_sessions(p_token text, p_from_date text DEFAULT NULL::text, p_limit integer DEFAULT 1)
 RETURNS TABLE(id uuid, data_seduta timestamp with time zone, feedback_paziente text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.salva_prima(p_nome text, p_blocco text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_nome
   limit 1;
  if v_def is null then
    return 'niente da salvare: ' || p_nome || ' non esiste ancora';
  end if;
  insert into public.sql_backup (oggetto, definizione, blocco)
  values (p_nome, v_def, p_blocco);
  return 'salvato il PRIMA di ' || p_nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_therapy_session(p_token text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_session_feedback(p_token text, p_session_id uuid, p_feedback text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

\set ON_ERROR_STOP 0
\echo === PRIMA (vive): l errore di oggi
select * from get_patient_sessions('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo === LANCIO 056
\i db/migrations/056_feedback_paziente.sql
\echo === DOPPIA ESECUZIONE
\i db/migrations/056_feedback_paziente.sql
select oggetto, blocco, count(*) from sql_backup group by 1,2 order by 1;
\echo === nessuna seduta: card visibile
select count(*) as righe from get_patient_sessions('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo === save senza sedute oggi: 4 stelle + nota
select save_therapy_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"feedback_paziente":"4 stelle — meglio la schiena"}') is not null as creata;
select feedback_paziente_benessere b, feedback_paziente_note n from therapy_sessions;
select feedback_paziente from get_patient_sessions('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo === save stesso giorno (dedup): non sovrascrive, nessun duplicato
select save_therapy_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"feedback_paziente":"2 stelle — altro"}') is not null;
select count(*) righe, max(feedback_paziente_benessere) b, max(feedback_paziente_note) n from therapy_sessions;
\echo === seduta del professionista ieri senza feedback, poi update
insert into therapy_sessions(id,patient_id,data_seduta) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111', now()-interval '1 day');
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','1 stella');
select feedback_paziente_benessere b, feedback_paziente_note n from therapy_sessions where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','5 stelle - ok');
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','solo testo, senza stelle');
select feedback_paziente_benessere b, feedback_paziente_note n from therapy_sessions where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','   ');
select feedback_paziente_benessere b, feedback_paziente_note n from therapy_sessions where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
select feedback_paziente from get_patient_sessions('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 5);
\echo === 7 stelle (fuori scala) resta testo; 1 stella grammatica
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','7 stelle');
select feedback_paziente_benessere b, feedback_paziente_note n from therapy_sessions where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
\echo === altro paziente: false, niente toccato
select update_session_feedback('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc','3 stelle — intruso');
select count(*) from get_patient_sessions('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 10);
\echo === token sbagliati
select count(*) from get_patient_sessions('dddddddd-dddd-dddd-dddd-dddddddddddd');
select count(*) from get_patient_sessions('non-uuid');
select count(*) from get_patient_sessions(null);
select save_therapy_session('non-uuid','{}');
select update_session_feedback('dddddddd-dddd-dddd-dddd-dddddddddddd','cccccccc-cccc-cccc-cccc-cccccccccccc','x');
\echo === testo lungo 3000: tagliato a 2000
select update_session_feedback('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc', repeat('a',3000));
select length(feedback_paziente_note) from therapy_sessions where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
\echo === GUARDIA: valore fuori 1-5 gia presente blocca tutto
update therapy_sessions set feedback_paziente_benessere=8 where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
begin; \i db/migrations/056_feedback_paziente.sql
rollback;
update therapy_sessions set feedback_paziente_benessere=5 where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
\echo === RITORNO INDIETRO da sql_backup
do $$ declare r record; begin
 for r in select distinct on (oggetto) definizione from sql_backup where blocco='056-feedback-v1' order by oggetto, salvato_il asc loop
   execute r.definizione; end loop; end $$;
select proname, pg_get_functiondef(oid) like '%056-feedback-v1%' as e_la_056 from pg_proc where proname in ('get_patient_sessions','save_therapy_session','update_session_feedback') order by 1;
select * from get_patient_sessions('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
