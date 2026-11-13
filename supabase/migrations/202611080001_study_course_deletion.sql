BEGIN;

-- Add a controlled path for the explicit, user-confirmed deletion of one
-- course and its associated history. Ordinary save_user_study_mvp_state calls
-- remain subject to the existing append-only and stable-identity guards.
DO $migration$
DECLARE
  v_definition text;
  v_marker text;
  v_updated text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.validate_user_study_mvp_state()')
  );
  v_marker := '  -- Top-level historical collections may only grow by appending.';
  IF pg_catalog.strpos(v_definition, v_marker) = 0 THEN
    RAISE EXCEPTION 'Could not locate the Study state history-guard anchor';
  END IF;
  v_updated := pg_catalog.replace(
    v_definition,
    v_marker,
    '  IF TG_OP = ''UPDATE'' AND pg_catalog.current_setting(''app.study_course_deletion'', true) = ''on'' THEN' || E'\n' ||
    '    RETURN NEW;' || E'\n' ||
    '  END IF;' || E'\n' ||
    v_marker
  );
  EXECUTE v_updated;

  v_definition := pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.validate_study_daily_plan_history()')
  );
  v_marker := '  IF TG_OP = ''UPDATE'' THEN' || E'\n' || '    v_old_array := COALESCE(';
  IF pg_catalog.strpos(v_definition, v_marker) = 0 THEN
    RAISE EXCEPTION 'Could not locate the daily-plan history-guard anchor';
  END IF;
  v_updated := pg_catalog.replace(
    v_definition,
    v_marker,
    '  IF TG_OP = ''UPDATE'' AND pg_catalog.current_setting(''app.study_course_deletion'', true) = ''on'' THEN' || E'\n' ||
    '    RETURN NEW;' || E'\n' ||
    '  END IF;' || E'\n' ||
    v_marker
  );
  EXECUTE v_updated;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.delete_user_study_mvp_course(
  p_course_id text,
  p_state jsonb,
  p_expected_revision bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_current_state jsonb;
  v_current_revision bigint;
  v_expected_courses jsonb;
  v_revision bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_course_id IS NULL OR pg_catalog.btrim(p_course_id) = '' THEN
    RAISE EXCEPTION 'A course ID is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'Expected Study revision must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_state) IS DISTINCT FROM 'object'
     OR (p_state ->> 'schema_version') IS DISTINCT FROM '1'
     OR pg_catalog.jsonb_typeof(p_state -> 'courses') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid replacement Study state'
      USING ERRCODE = '22023';
  END IF;

  SELECT state, revision
    INTO v_current_state, v_current_revision
  FROM public.user_study_mvp_state
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_current_state IS NULL OR v_current_revision <> p_expected_revision THEN
    RAISE EXCEPTION
      'Study MVP revision conflict: state changed or no longer exists; reload before deleting'
      USING ERRCODE = '40001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_current_state -> 'courses') AS course(item)
    WHERE course.item ->> 'id' = p_course_id
  ) THEN
    RAISE EXCEPTION 'Course % was not found', p_course_id
      USING ERRCODE = '22023';
  END IF;

  -- Only the named course may be removed from the course list. Preserve every
  -- other course record byte-for-byte and in its original order.
  SELECT COALESCE(pg_catalog.jsonb_agg(course.item ORDER BY course.ordinal), '[]'::jsonb)
    INTO v_expected_courses
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'courses')
       WITH ORDINALITY AS course(item, ordinal)
  WHERE course.item ->> 'id' <> p_course_id;

  IF (p_state -> 'courses') IS DISTINCT FROM v_expected_courses THEN
    RAISE EXCEPTION 'Course deletion must remove exactly the selected course'
      USING ERRCODE = '22023';
  END IF;

  -- The existing UPDATE backup trigger records the complete pre-delete state.
  -- This transaction-local flag is only set inside this dedicated RPC.
  PERFORM pg_catalog.set_config('app.study_course_deletion', 'on', true);

  UPDATE public.user_study_mvp_state
  SET
    state = p_state,
    revision = revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  WHERE user_id = v_user_id
    AND revision = p_expected_revision
  RETURNING revision INTO v_revision;

  IF v_revision IS NULL THEN
    RAISE EXCEPTION
      'Study MVP revision conflict: state changed while deleting the course'
      USING ERRCODE = '40001';
  END IF;

  RETURN v_revision;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_study_mvp_course(text, jsonb, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_study_mvp_course(text, jsonb, bigint)
  TO authenticated;

COMMIT;
