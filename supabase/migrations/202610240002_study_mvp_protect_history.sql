BEGIN;

-- Strengthen database-side protection to match the Study storage
-- invariants. This applies to saves made through the revision-checked RPC.

CREATE OR REPLACE FUNCTION public.validate_user_study_mvp_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_collection text;
  v_field text;
  v_old_array jsonb;
  v_new_array jsonb;
  v_old_length integer;
  v_new_length integer;
  v_index integer;
  v_old_item jsonb;
  v_new_item jsonb;
  v_old_id text;
BEGIN
  IF pg_catalog.jsonb_typeof(NEW.state) IS DISTINCT FROM 'object'
     OR (NEW.state ->> 'schema_version') IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'Invalid Study MVP state or schema version';
  END IF;

  -- Require every top-level collection used by schema version 1.
  FOREACH v_collection IN ARRAY ARRAY[
    'courses',
    'units',
    'topics',
    'lectures',
    'retrieval_tasks',
    'review_events',
    'task_events',
    'work_sessions',
    'assignments',
    'exams',
    'weekly_metrics',
    'settings_change_history'
  ]
  LOOP
    v_new_array := NEW.state -> v_collection;

    IF pg_catalog.jsonb_typeof(v_new_array)
       IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION
        'Study MVP collection "%" must be an array',
        v_collection;
    END IF;
  END LOOP;

  -- Engine settings history is also append-only.
  v_new_array :=
    NEW.state #> '{settings,engine_change_history}';

  IF pg_catalog.jsonb_typeof(v_new_array)
     IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION
      'Study MVP engine change history must be an array';
  END IF;

  -- Validate entity collections and prevent duplicate or missing IDs.
  FOREACH v_collection IN ARRAY ARRAY[
    'courses',
    'units',
    'topics',
    'lectures',
    'retrieval_tasks',
    'review_events',
    'task_events',
    'work_sessions',
    'assignments',
    'exams',
    'settings_change_history'
  ]
  LOOP
    v_new_array := NEW.state -> v_collection;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_new_array) AS a(item)
      WHERE pg_catalog.jsonb_typeof(a.item)
              IS DISTINCT FROM 'object'
         OR pg_catalog.jsonb_typeof(a.item -> 'id')
              IS DISTINCT FROM 'string'
         OR pg_catalog.btrim(a.item ->> 'id') = ''
    ) THEN
      RAISE EXCEPTION
        'Study MVP collection "%" contains an invalid ID',
        v_collection;
    END IF;

    IF EXISTS (
      SELECT a.item ->> 'id'
      FROM pg_catalog.jsonb_array_elements(v_new_array) AS a(item)
      GROUP BY a.item ->> 'id'
      HAVING pg_catalog.count(*) > 1
    ) THEN
      RAISE EXCEPTION
        'Study MVP collection "%" contains duplicate IDs',
        v_collection;
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'Initial Study MVP revision must be 1';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Study MVP owner cannot be changed';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION
      'Study MVP revision must advance by exactly one';
  END IF;

  -- Top-level historical collections may only grow by appending.
  FOREACH v_collection IN ARRAY ARRAY[
    'task_events',
    'work_sessions',
    'weekly_metrics',
    'settings_change_history'
  ]
  LOOP
    v_old_array := OLD.state -> v_collection;
    v_new_array := NEW.state -> v_collection;

    IF pg_catalog.jsonb_typeof(v_old_array)
         IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_typeof(v_new_array)
         IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION
        'Study MVP history "%" must be an array',
        v_collection;
    END IF;

    v_old_length :=
      pg_catalog.jsonb_array_length(v_old_array);
    v_new_length :=
      pg_catalog.jsonb_array_length(v_new_array);

    IF v_new_length < v_old_length THEN
      RAISE EXCEPTION
        'Study MVP history "%" cannot shrink',
        v_collection;
    END IF;

    IF v_old_length > 0 THEN
      FOR v_index IN 0..(v_old_length - 1)
      LOOP
        IF (v_old_array -> v_index)
           IS DISTINCT FROM (v_new_array -> v_index)
        THEN
          RAISE EXCEPTION
            'Study MVP history "%" cannot be rewritten or reordered',
            v_collection;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Nested engine settings history must follow the same rule.
  v_old_array :=
    OLD.state #> '{settings,engine_change_history}';
  v_new_array :=
    NEW.state #> '{settings,engine_change_history}';

  v_old_length :=
    pg_catalog.jsonb_array_length(v_old_array);
  v_new_length :=
    pg_catalog.jsonb_array_length(v_new_array);

  IF v_new_length < v_old_length THEN
    RAISE EXCEPTION
      'Study MVP engine change history cannot shrink';
  END IF;

  IF v_old_length > 0 THEN
    FOR v_index IN 0..(v_old_length - 1)
    LOOP
      IF (v_old_array -> v_index)
         IS DISTINCT FROM (v_new_array -> v_index)
      THEN
        RAISE EXCEPTION
          'Study MVP engine change history cannot be rewritten or reordered';
      END IF;
    END LOOP;
  END IF;

  -- Existing entity IDs cannot disappear during a state replacement.
  FOREACH v_collection IN ARRAY ARRAY[
    'courses',
    'units',
    'topics',
    'lectures',
    'retrieval_tasks',
    'review_events',
    'assignments',
    'exams'
  ]
  LOOP
    v_old_array := OLD.state -> v_collection;
    v_new_array := NEW.state -> v_collection;

    IF pg_catalog.jsonb_typeof(v_old_array)
       IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION
        'Existing Study MVP collection "%" is invalid',
        v_collection;
    END IF;

    v_old_length :=
      pg_catalog.jsonb_array_length(v_old_array);

    IF v_old_length > 0 THEN
      FOR v_index IN 0..(v_old_length - 1)
      LOOP
        v_old_item := v_old_array -> v_index;
        v_old_id := v_old_item ->> 'id';
        v_new_item := NULL;

        SELECT a.item
        INTO v_new_item
        FROM pg_catalog.jsonb_array_elements(v_new_array) AS a(item)
        WHERE a.item ->> 'id' = v_old_id
        LIMIT 1;

        IF v_new_item IS NULL THEN
          RAISE EXCEPTION
            'Existing Study MVP entity "%" with ID "%" cannot be deleted',
            v_collection,
            v_old_id;
        END IF;

        -- Review scheduling identity must remain immutable.
        IF v_collection = 'review_events' THEN
          FOREACH v_field IN ARRAY ARRAY[
            'id',
            'topic_id',
            'stage',
            'event_kind',
            'holds_stage',
            'selected_task_ids',
            'source_review_id',
            'intended_due_date',
            'priority_at_scheduling',
            'moved_from_sunday'
          ]
          LOOP
            IF (v_old_item -> v_field)
               IS DISTINCT FROM (v_new_item -> v_field)
            THEN
              RAISE EXCEPTION
                'ReviewEvent "%" cannot change immutable field "%"',
                v_old_id,
                v_field;
            END IF;
          END LOOP;

          -- Once a review has a terminal completion timestamp,
          -- its terminal result cannot be rewritten.
          IF (v_old_item -> 'completed_at') IS NOT NULL
             AND (v_old_item -> 'completed_at')
                   IS DISTINCT FROM 'null'::jsonb
          THEN
            IF (v_old_item -> 'completed_at')
                 IS DISTINCT FROM (v_new_item -> 'completed_at')
               OR (v_old_item -> 'overall_result')
                 IS DISTINCT FROM (v_new_item -> 'overall_result')
               OR (v_old_item -> 'yellow_gap_severity')
                 IS DISTINCT FROM (v_new_item -> 'yellow_gap_severity')
            THEN
              RAISE EXCEPTION
                'Completed ReviewEvent "%" cannot have its terminal result rewritten',
                v_old_id;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMIT;
