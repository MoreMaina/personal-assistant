BEGIN;

-- Optional for older schema-v1 records; append-only once present.
CREATE OR REPLACE FUNCTION public.validate_study_daily_plan_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_old_array jsonb;
  v_new_array jsonb;
  v_old_length integer;
  v_new_length integer;
  v_index integer;
BEGIN
  v_new_array := COALESCE(
    NULLIF(NEW.state -> 'daily_plan_history', 'null'::jsonb),
    '[]'::jsonb
  );

  IF pg_catalog.jsonb_typeof(v_new_array) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Study daily_plan_history must be an array when present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_new_array) AS entry(item)
    WHERE pg_catalog.jsonb_typeof(entry.item) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(entry.item -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(entry.item ->> 'id') = ''
       OR pg_catalog.jsonb_typeof(entry.item -> 'date') IS DISTINCT FROM 'string'
       OR (entry.item ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR pg_catalog.jsonb_typeof(entry.item -> 'version') IS DISTINCT FROM 'number'
       OR (entry.item ->> 'version') !~ '^[1-9][0-9]*$'
       OR pg_catalog.jsonb_typeof(entry.item -> 'saved_at') IS DISTINCT FROM 'string'
       OR pg_catalog.btrim(entry.item ->> 'saved_at') = ''
       OR pg_catalog.jsonb_typeof(entry.item -> 'plan') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(entry.item #> '{plan,items}') IS DISTINCT FROM 'array'
       OR (entry.item #>> '{plan,date}') IS DISTINCT FROM (entry.item ->> 'date')
  ) THEN
    RAISE EXCEPTION 'Study daily plan history contains an invalid snapshot';
  END IF;

  IF EXISTS (
    SELECT entry.item ->> 'id'
    FROM pg_catalog.jsonb_array_elements(v_new_array) AS entry(item)
    GROUP BY entry.item ->> 'id'
    HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT entry.item ->> 'date', entry.item ->> 'version'
    FROM pg_catalog.jsonb_array_elements(v_new_array) AS entry(item)
    GROUP BY entry.item ->> 'date', entry.item ->> 'version'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Study daily plan history contains duplicate snapshot IDs or versions';
  END IF;

  -- Every date's versions must be contiguous from 1.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        (entry.item ->> 'version')::bigint AS actual_version,
        pg_catalog.row_number() OVER (
          PARTITION BY entry.item ->> 'date'
          ORDER BY (entry.item ->> 'version')::bigint
        ) AS expected_version
      FROM pg_catalog.jsonb_array_elements(v_new_array) AS entry(item)
    ) AS versions
    WHERE versions.actual_version <> versions.expected_version
  ) THEN
    RAISE EXCEPTION 'Study daily plan versions must be sequential per date';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_array := COALESCE(
      NULLIF(OLD.state -> 'daily_plan_history', 'null'::jsonb),
      '[]'::jsonb
    );

    IF pg_catalog.jsonb_typeof(v_old_array) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Existing Study daily plan history is invalid';
    END IF;

    v_old_length := pg_catalog.jsonb_array_length(v_old_array);
    v_new_length := pg_catalog.jsonb_array_length(v_new_array);

    IF v_new_length < v_old_length THEN
      RAISE EXCEPTION 'Study daily plan history cannot shrink or be deleted';
    END IF;

    IF v_old_length > 0 THEN
      FOR v_index IN 0..(v_old_length - 1)
      LOOP
        IF (v_old_array -> v_index)
           IS DISTINCT FROM (v_new_array -> v_index)
        THEN
          RAISE EXCEPTION 'Study daily plan history cannot be rewritten or reordered';
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_study_mvp_daily_plan_history_guard
  ON public.user_study_mvp_state;

CREATE TRIGGER user_study_mvp_daily_plan_history_guard
  BEFORE INSERT OR UPDATE ON public.user_study_mvp_state
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_study_daily_plan_history();

REVOKE ALL ON FUNCTION public.validate_study_daily_plan_history()
  FROM PUBLIC, anon, authenticated;

COMMIT;
