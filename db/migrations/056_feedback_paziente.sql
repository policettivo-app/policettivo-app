-- 056 feedback paziente: le tre RPC scrivono e leggono le colonne vere
-- Rollback: select definizione from public.sql_backup where blocco='056-feedback-v1' ...

do $$ begin
  perform public.salva_prima('get_patient_sessions', '056-feedback-v1');
  perform public.salva_prima('save_therapy_session', '056-feedback-v1');
  perform public.salva_prima('update_session_feedback', '056-feedback-v1');
exception when undefined_function then
  raise notice 'salva_prima non esiste: prima non salvato';
end $$;

do $$ begin
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='therapy_sessions'
         and column_name in ('feedback_paziente_benessere','feedback_paziente_esercizi','feedback_paziente_note')) <> 3 then
    raise exception 'FERMO: in therapy_sessions mancano le colonne feedback_paziente_*. Non ho cambiato niente.';
  end if;
  if exists (select 1 from public.therapy_sessions
              where feedback_paziente_benessere is not null
                and feedback_paziente_benessere not between 1 and 5) then
    raise exception 'FERMO: feedback_paziente_benessere ha gia valori fuori da 1-5. Non ho cambiato niente, mandami questo messaggio.';
  end if;
end $$;

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
  -- 056-feedback-v1: feedback_paziente composto dalle colonne vere
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RETURN;
  END IF;
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
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 1), 10));
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
    NULLIF(CONCAT_WS(' — ',
      CASE WHEN ts.feedback_paziente_benessere = 1 THEN '1 stella'
           WHEN ts.feedback_paziente_benessere IS NOT NULL THEN ts.feedback_paziente_benessere::text || ' stelle' END,
      NULLIF(BTRIM(ts.feedback_paziente_esercizi), ''),
      NULLIF(BTRIM(ts.feedback_paziente_note), '')
    ), '')::text
  FROM therapy_sessions ts
  WHERE ts.patient_id = v_patient_id
    AND (v_from_ts IS NULL OR ts.data_seduta >= v_from_ts)
  ORDER BY ts.data_seduta DESC
  LIMIT v_limit;
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
  v_txt        text;
  v_m          text[];
  v_ben        int;
  v_note       text;
BEGIN
  -- 056-feedback-v1: stelle in feedback_paziente_benessere, testo in feedback_paziente_note
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
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

  v_txt := NULLIF(BTRIM(LEFT(p_feedback, 2000)), '');
  v_m := regexp_match(v_txt, '^([1-5])\s*stell[ae]\s*(?:[—–-]\s*(.*))?$');
  IF v_m IS NOT NULL THEN
    v_ben  := v_m[1]::int;
    v_note := NULLIF(BTRIM(v_m[2]), '');
  ELSE
    v_note := v_txt;
  END IF;

  UPDATE therapy_sessions
     SET feedback_paziente_benessere = COALESCE(v_ben,  feedback_paziente_benessere),
         feedback_paziente_note      = COALESCE(v_note, feedback_paziente_note)
   WHERE id         = p_session_id
     AND patient_id = v_patient_id;

  RETURN FOUND;
END;
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
  v_txt         text;
  v_m           text[];
  v_ben         int;
  v_note        text;
BEGIN
  -- 056-feedback-v1: stelle in feedback_paziente_benessere, testo in feedback_paziente_note
  IF p_token IS NULL OR LENGTH(TRIM(p_token)) = 0 THEN
    RAISE EXCEPTION 'Operazione non autorizzata';
  END IF;
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
  BEGIN
    v_data_seduta := (p_data->>'data_seduta')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_data_seduta := now();
  END;
  IF v_data_seduta IS NULL THEN
    v_data_seduta := now();
  END IF;

  v_txt := NULLIF(BTRIM(LEFT(p_data->>'feedback_paziente', 2000)), '');
  v_m := regexp_match(v_txt, '^([1-5])\s*stell[ae]\s*(?:[—–-]\s*(.*))?$');
  IF v_m IS NOT NULL THEN
    v_ben  := v_m[1]::int;
    v_note := NULLIF(BTRIM(v_m[2]), '');
  ELSE
    v_note := v_txt;
  END IF;

  SELECT id INTO v_session_id
    FROM therapy_sessions
   WHERE patient_id = v_patient_id
     AND DATE(data_seduta AT TIME ZONE 'UTC') = CURRENT_DATE
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    -- seduta di oggi gia presente: il feedback non si perde, ma non sovrascrive quello che c'e
    UPDATE therapy_sessions
       SET feedback_paziente_benessere = COALESCE(feedback_paziente_benessere, v_ben),
           feedback_paziente_note      = COALESCE(feedback_paziente_note, v_note)
     WHERE id = v_session_id;
    RETURN v_session_id;
  END IF;

  INSERT INTO therapy_sessions (patient_id, data_seduta, feedback_paziente_benessere, feedback_paziente_note)
  VALUES (v_patient_id, v_data_seduta, v_ben, v_note)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$function$;
