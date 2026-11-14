BEGIN;

-- Re-enable permanent course deletion only through a strictly constrained RPC.
-- The function builds the complete permitted replacement from the locked cloud
-- state and compares it byte-for-byte (JSONB semantics) with the caller payload.
-- A caller cannot use the transaction-local trigger bypass to alter unrelated
-- courses, records, settings, or history.
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
  v_expected_state jsonb;
  v_expected_array jsonb;
  v_unit_ids text[] := ARRAY[]::text[];
  v_topic_ids text[] := ARRAY[]::text[];
  v_task_ids text[] := ARRAY[]::text[];
  v_review_ids text[] := ARRAY[]::text[];
  v_assignment_ids text[] := ARRAY[]::text[];
  v_exam_ids text[] := ARRAY[]::text[];
  v_lecture_ids text[] := ARRAY[]::text[];
  v_course_entity_ids text[] := ARRAY[]::text[];
  v_shared_session_keys text[] := ARRAY[]::text[];
  v_deleted_work_session_ids text[] := ARRAY[]::text[];
  v_deleted_task_event_ids text[] := ARRAY[]::text[];
  v_new_task_event_ids text[] := ARRAY[]::text[];
  v_timezone text;
  v_revision bigint;
  v_execution jsonb;
  v_normalized_execution jsonb;
  v_snapshot jsonb;
  v_completed_item_ids text[];
  v_completed_section_ids jsonb;
  v_invalid_plan_items bigint;
  v_execution_count integer := 0;
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

  IF pg_catalog.jsonb_typeof(v_current_state -> 'courses') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'units') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'topics') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'lectures') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'retrieval_tasks') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'review_events') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'task_events') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'work_sessions') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'assignments') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'exams') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_current_state -> 'weekly_metrics') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'The current Study state is missing a required collection'
      USING ERRCODE = '22023';
  END IF;

  v_timezone := v_current_state #>> '{settings,timezone}';
  IF v_timezone IS NULL OR pg_catalog.btrim(v_timezone) = '' THEN
    RAISE EXCEPTION 'The current Study timezone is invalid; no course data were deleted'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_current_state -> 'courses') AS course(item)
    WHERE course.item ->> 'id' = p_course_id
  ) THEN
    RAISE EXCEPTION 'Course % was not found', p_course_id
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(unit.item ->> 'id'), ARRAY[]::text[])
    INTO v_unit_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'units') AS unit(item)
  WHERE unit.item ->> 'course_id' = p_course_id;

  SELECT COALESCE(pg_catalog.array_agg(topic.item ->> 'id'), ARRAY[]::text[])
    INTO v_topic_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'topics') AS topic(item)
  WHERE topic.item ->> 'unit_id' = ANY(v_unit_ids);

  SELECT COALESCE(pg_catalog.array_agg(task.item ->> 'id'), ARRAY[]::text[])
    INTO v_task_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'retrieval_tasks') AS task(item)
  WHERE task.item ->> 'topic_id' = ANY(v_topic_ids);

  SELECT COALESCE(pg_catalog.array_agg(review.item ->> 'id'), ARRAY[]::text[])
    INTO v_review_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'review_events') AS review(item)
  WHERE review.item ->> 'topic_id' = ANY(v_topic_ids);

  SELECT COALESCE(pg_catalog.array_agg(assignment.item ->> 'id'), ARRAY[]::text[])
    INTO v_assignment_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'assignments') AS assignment(item)
  WHERE assignment.item ->> 'course_id' = p_course_id;

  SELECT COALESCE(pg_catalog.array_agg(exam.item ->> 'id'), ARRAY[]::text[])
    INTO v_exam_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'exams') AS exam(item)
  WHERE exam.item ->> 'course_id' = p_course_id;

  SELECT COALESCE(pg_catalog.array_agg(lecture.item ->> 'id'), ARRAY[]::text[])
    INTO v_lecture_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'lectures') AS lecture(item)
  WHERE lecture.item ->> 'unit_id' = ANY(v_unit_ids)
     OR lecture.item ->> 'topic_id' = ANY(v_topic_ids);

  v_course_entity_ids := ARRAY[p_course_id]
    || v_unit_ids
    || v_topic_ids
    || v_task_ids
    || v_review_ids
    || v_assignment_ids
    || v_exam_ids
    || v_lecture_ids;

  -- A mixed-practice or sampler block is frozen as one session. If its frozen
  -- selection contains a task from this course, remove the whole shared block.
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT pg_catalog.jsonb_build_array(
      event.item ->> 'subject_type',
      event.item ->> 'subject_id',
      (((event.item ->> 'logged_at')::timestamptz AT TIME ZONE v_timezone)::date)::text
    )::text),
    ARRAY[]::text[]
  )
    INTO v_shared_session_keys
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'task_events') AS event(item)
  WHERE event.item ->> 'event_type' = 'guided_practice_attempt'
    AND event.item ->> 'subject_type' IN ('mixed_practice', 'sampler')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(
        CASE
          WHEN pg_catalog.jsonb_typeof(event.item -> 'guided_practice_selected_task_ids_snapshot') = 'array'
            THEN event.item -> 'guided_practice_selected_task_ids_snapshot'
          ELSE '[]'::jsonb
        END
      ) AS selected(task_id)
      WHERE selected.task_id = ANY(v_task_ids)
    );

  SELECT COALESCE(pg_catalog.array_agg(session.item ->> 'id'), ARRAY[]::text[])
    INTO v_deleted_work_session_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'work_sessions') AS session(item)
  WHERE session.item ->> 'subject_id' = ANY(v_course_entity_ids)
     OR (
       session.item ->> 'subject_type' IN ('mixed_practice', 'sampler')
       AND pg_catalog.jsonb_build_array(
         session.item ->> 'subject_type',
         session.item ->> 'subject_id',
         (((session.item ->> 'logged_at')::timestamptz AT TIME ZONE v_timezone)::date)::text
       )::text = ANY(v_shared_session_keys)
     )
     OR (
       session.item ->> 'subject_type' = 'assignment'
       AND session.item ->> 'subject_id' = ANY(v_assignment_ids)
     )
     OR (
       session.item ->> 'subject_type' IN ('corrective', 'recovery', 'topic_consolidation', 'initial_learning')
       AND session.item ->> 'subject_id' = ANY(v_topic_ids || v_task_ids)
     );

  -- Seed event deletion from direct links, frozen task selections, shared
  -- mixed-practice blocks, and deleted work sessions.
  SELECT COALESCE(pg_catalog.array_agg(event.item ->> 'id'), ARRAY[]::text[])
    INTO v_deleted_task_event_ids
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'task_events') AS event(item)
  WHERE event.item ->> 'review_event_id' = ANY(v_review_ids)
     OR event.item ->> 'retrieval_task_id' = ANY(v_task_ids)
     OR event.item ->> 'work_session_id' = ANY(v_deleted_work_session_ids)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements_text(
         CASE
           WHEN pg_catalog.jsonb_typeof(event.item -> 'gate_selected_task_ids_snapshot') = 'array'
             THEN event.item -> 'gate_selected_task_ids_snapshot'
           ELSE '[]'::jsonb
         END
       ) AS selected(task_id)
       WHERE selected.task_id = ANY(v_task_ids)
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements_text(
         CASE
           WHEN pg_catalog.jsonb_typeof(event.item -> 'guided_practice_selected_task_ids_snapshot') = 'array'
             THEN event.item -> 'guided_practice_selected_task_ids_snapshot'
           ELSE '[]'::jsonb
         END
       ) AS selected(task_id)
       WHERE selected.task_id = ANY(v_task_ids)
     )
     OR (
       event.item ->> 'subject_type' IN ('mixed_practice', 'sampler')
       AND pg_catalog.jsonb_build_array(
         event.item ->> 'subject_type',
         event.item ->> 'subject_id',
         (((event.item ->> 'logged_at')::timestamptz AT TIME ZONE v_timezone)::date)::text
       )::text = ANY(v_shared_session_keys)
     )
     OR (
       event.item ->> 'subject_type' = 'review_event'
       AND event.item ->> 'subject_id' = ANY(v_review_ids)
     )
     OR (
       event.item ->> 'subject_type' = 'retrieval_task'
       AND event.item ->> 'subject_id' = ANY(v_task_ids)
     )
     OR (
       event.item ->> 'subject_type' IN ('gate_attempt', 'corrective_task')
       AND (
         event.item ->> 'subject_id' = ANY(v_task_ids)
         OR event.item ->> 'subject_id' = ANY(v_topic_ids)
       )
     )
     OR (
       event.item ->> 'subject_type' = 'assignment'
       AND event.item ->> 'subject_id' = ANY(v_assignment_ids)
     )
     OR (
       event.item ->> 'subject_type' IN ('topic_consolidation', 'initial_learning')
       AND event.item ->> 'subject_id' = ANY(v_topic_ids)
     );

  -- Work-session events are deleted even if they have no direct course link.
  -- Related events are then removed transitively so no linked chain is orphaned.
  LOOP
    SELECT COALESCE(pg_catalog.array_agg(event.item ->> 'id'), ARRAY[]::text[])
      INTO v_new_task_event_ids
    FROM pg_catalog.jsonb_array_elements(v_current_state -> 'task_events') AS event(item)
    WHERE event.item ->> 'related_event_id' = ANY(v_deleted_task_event_ids)
      AND NOT (event.item ->> 'id' = ANY(v_deleted_task_event_ids));

    EXIT WHEN pg_catalog.cardinality(v_new_task_event_ids) = 0;
    v_deleted_task_event_ids := v_deleted_task_event_ids || v_new_task_event_ids;
  END LOOP;

  -- Construct the only replacement state this RPC will accept.
  v_expected_state := v_current_state;

  -- Match the client's legacy daily-plan execution normalization. Older
  -- schema-v1 rows may still store completed_item_ids; the current client
  -- derives completed_section_ids from the immutable saved plan snapshot.
  v_execution_count := 0;
  IF pg_catalog.jsonb_typeof(v_current_state -> 'daily_plan_executions') = 'array' THEN
    v_execution_count := pg_catalog.jsonb_array_length(
      v_current_state -> 'daily_plan_executions'
    );
  END IF;

  IF v_execution_count > 0 THEN
    v_expected_array := '[]'::jsonb;
    FOR v_execution IN
      SELECT execution.item
      FROM pg_catalog.jsonb_array_elements(v_current_state -> 'daily_plan_executions')
           WITH ORDINALITY AS execution(item, ordinal)
      ORDER BY execution.ordinal
    LOOP
      v_normalized_execution := v_execution;

      IF pg_catalog.jsonb_typeof(v_execution) = 'object'
         AND pg_catalog.jsonb_typeof(v_execution -> 'completed_section_ids') IS DISTINCT FROM 'array'
         AND pg_catalog.jsonb_typeof(v_execution -> 'completed_item_ids') = 'array'
         AND pg_catalog.jsonb_typeof(v_execution -> 'plan_snapshot_id') = 'string'
         AND pg_catalog.btrim(v_execution ->> 'plan_snapshot_id') <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_array_elements(
             CASE
               WHEN pg_catalog.jsonb_typeof(v_execution -> 'completed_item_ids') = 'array'
                 THEN v_execution -> 'completed_item_ids'
               ELSE '[]'::jsonb
             END
           ) AS completed(item)
           WHERE pg_catalog.jsonb_typeof(completed.item) IS DISTINCT FROM 'string'
         )
      THEN
        v_snapshot := NULL;
        SELECT snapshot.item
          INTO v_snapshot
        FROM pg_catalog.jsonb_array_elements(
          CASE
            WHEN pg_catalog.jsonb_typeof(v_current_state -> 'daily_plan_history') = 'array'
              THEN v_current_state -> 'daily_plan_history'
            ELSE '[]'::jsonb
          END
        ) AS snapshot(item)
        WHERE snapshot.item ->> 'id' = v_execution ->> 'plan_snapshot_id'
        LIMIT 1;

        IF pg_catalog.jsonb_typeof(v_snapshot) = 'object'
           AND pg_catalog.jsonb_typeof(v_snapshot -> 'plan') = 'object'
           AND pg_catalog.jsonb_typeof(v_snapshot #> '{plan,items}') = 'array'
        THEN
          SELECT pg_catalog.count(*)
            INTO v_invalid_plan_items
          FROM pg_catalog.jsonb_array_elements(v_snapshot #> '{plan,items}') AS plan_item(item)
          WHERE pg_catalog.jsonb_typeof(plan_item.item) IS DISTINCT FROM 'object'
             OR pg_catalog.jsonb_typeof(plan_item.item -> 'id') IS DISTINCT FROM 'string'
             OR pg_catalog.btrim(plan_item.item ->> 'id') = ''
             OR (CASE plan_item.item ->> 'kind'
                   WHEN 'initial_learning' THEN 'initial_learning'
                   WHEN 'gate' THEN 'topic_gate'
                   WHEN 'review' THEN 'reviews'
                   WHEN 'assignment' THEN 'assignments'
                   WHEN 'topic_consolidation' THEN 'topic_consolidation'
                   WHEN 'corrective' THEN 'corrective'
                   WHEN 'recovery' THEN 'recovery'
                   WHEN 'mixed_practice' THEN 'mixed_practice'
                   WHEN 'sampler' THEN 'sampler'
                   ELSE NULL
                 END) IS NULL;

          IF v_invalid_plan_items = 0 THEN
            SELECT COALESCE(pg_catalog.array_agg(completed.item #>> ARRAY[]::text[]), ARRAY[]::text[])
              INTO v_completed_item_ids
            FROM pg_catalog.jsonb_array_elements(v_execution -> 'completed_item_ids') AS completed(item);

            SELECT COALESCE(pg_catalog.jsonb_agg(
              to_jsonb(grouped.section_id) ORDER BY grouped.first_ordinal
            ), '[]'::jsonb)
              INTO v_completed_section_ids
            FROM (
              SELECT section_item.section_id, pg_catalog.min(section_item.ordinal) AS first_ordinal
              FROM (
                SELECT
                  CASE plan_item.item ->> 'kind'
                    WHEN 'initial_learning' THEN 'initial_learning'
                    WHEN 'gate' THEN 'topic_gate'
                    WHEN 'review' THEN 'reviews'
                    WHEN 'assignment' THEN 'assignments'
                    WHEN 'topic_consolidation' THEN 'topic_consolidation'
                    WHEN 'corrective' THEN 'corrective'
                    WHEN 'recovery' THEN 'recovery'
                    WHEN 'mixed_practice' THEN 'mixed_practice'
                    WHEN 'sampler' THEN 'sampler'
                  END AS section_id,
                  plan_item.item ->> 'id' AS item_id,
                  plan_item.ordinal
                FROM pg_catalog.jsonb_array_elements(v_snapshot #> '{plan,items}')
                     WITH ORDINALITY AS plan_item(item, ordinal)
              ) AS section_item
              GROUP BY section_item.section_id
              HAVING pg_catalog.bool_and(section_item.item_id = ANY(v_completed_item_ids))
            ) AS grouped;

            v_normalized_execution := pg_catalog.jsonb_set(
              v_execution,
              ARRAY['completed_section_ids'],
              v_completed_section_ids,
              true
            );
          END IF;
        END IF;
      END IF;

      v_expected_array := v_expected_array || pg_catalog.jsonb_build_array(v_normalized_execution);
    END LOOP;

    v_expected_state := pg_catalog.jsonb_set(
      v_expected_state,
      ARRAY['daily_plan_executions'],
      v_expected_array,
      true
    );
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(course.item ORDER BY course.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'courses')
       WITH ORDINALITY AS course(item, ordinal)
  WHERE course.item ->> 'id' <> p_course_id;
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['courses'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(unit.item ORDER BY unit.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'units')
       WITH ORDINALITY AS unit(item, ordinal)
  WHERE NOT (unit.item ->> 'id' = ANY(v_unit_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['units'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE
      WHEN pg_catalog.jsonb_typeof(topic.item -> 'prerequisite_topic_ids') = 'array' THEN
        pg_catalog.jsonb_set(
          topic.item,
          ARRAY['prerequisite_topic_ids'],
          (
            SELECT COALESCE(pg_catalog.jsonb_agg(prerequisite.value ORDER BY prerequisite.ordinal), '[]'::jsonb)
            FROM pg_catalog.jsonb_array_elements_text(topic.item -> 'prerequisite_topic_ids')
                 WITH ORDINALITY AS prerequisite(value, ordinal)
            WHERE NOT (prerequisite.value = ANY(v_topic_ids))
          ),
          true
        )
      ELSE topic.item
    END
    ORDER BY topic.ordinal
  ), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'topics')
       WITH ORDINALITY AS topic(item, ordinal)
  WHERE NOT (topic.item ->> 'id' = ANY(v_topic_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['topics'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(lecture.item ORDER BY lecture.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'lectures')
       WITH ORDINALITY AS lecture(item, ordinal)
  WHERE NOT (lecture.item ->> 'id' = ANY(v_lecture_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['lectures'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(task.item ORDER BY task.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'retrieval_tasks')
       WITH ORDINALITY AS task(item, ordinal)
  WHERE NOT (task.item ->> 'id' = ANY(v_task_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['retrieval_tasks'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(review.item ORDER BY review.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'review_events')
       WITH ORDINALITY AS review(item, ordinal)
  WHERE NOT (review.item ->> 'id' = ANY(v_review_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['review_events'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(event.item ORDER BY event.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'task_events')
       WITH ORDINALITY AS event(item, ordinal)
  WHERE NOT (event.item ->> 'id' = ANY(v_deleted_task_event_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['task_events'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(session.item ORDER BY session.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'work_sessions')
       WITH ORDINALITY AS session(item, ordinal)
  WHERE NOT (session.item ->> 'id' = ANY(v_deleted_work_session_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['work_sessions'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(assignment.item ORDER BY assignment.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'assignments')
       WITH ORDINALITY AS assignment(item, ordinal)
  WHERE NOT (assignment.item ->> 'id' = ANY(v_assignment_ids));
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['assignments'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        exam.item,
        ARRAY['coverage_units'],
        (
          SELECT COALESCE(pg_catalog.jsonb_agg(coverage.value ORDER BY coverage.ordinal), '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements_text(
            CASE WHEN pg_catalog.jsonb_typeof(exam.item -> 'coverage_units') = 'array'
              THEN exam.item -> 'coverage_units' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS coverage(value, ordinal)
          WHERE NOT (coverage.value = ANY(v_unit_ids))
        ),
        true
      ),
      ARRAY['coverage_topics'],
      (
        SELECT COALESCE(pg_catalog.jsonb_agg(coverage.value ORDER BY coverage.ordinal), '[]'::jsonb)
        FROM pg_catalog.jsonb_array_elements_text(
          CASE WHEN pg_catalog.jsonb_typeof(exam.item -> 'coverage_topics') = 'array'
            THEN exam.item -> 'coverage_topics' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS coverage(value, ordinal)
        WHERE NOT (coverage.value = ANY(v_topic_ids))
      ),
      true
    )
    ORDER BY exam.ordinal
  ), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'exams')
       WITH ORDINALITY AS exam(item, ordinal)
  WHERE exam.item ->> 'id' <> ALL(v_exam_ids);
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['exams'], v_expected_array, true);

  SELECT COALESCE(pg_catalog.jsonb_agg(metric.item ORDER BY metric.ordinal), '[]'::jsonb)
    INTO v_expected_array
  FROM pg_catalog.jsonb_array_elements(v_current_state -> 'weekly_metrics')
       WITH ORDINALITY AS metric(item, ordinal)
  WHERE NOT (
    EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(
        CASE WHEN pg_catalog.jsonb_typeof(metric.item -> 'source_event_ids') = 'array'
          THEN metric.item -> 'source_event_ids' ELSE '[]'::jsonb END
      ) AS source(event_id)
      WHERE source.event_id = ANY(v_deleted_task_event_ids)
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(metric.item -> 'source_snapshot') = 'array'
          THEN metric.item -> 'source_snapshot' ELSE '[]'::jsonb END
      ) AS source(event)
      WHERE source.event ->> 'id' = ANY(v_deleted_task_event_ids)
    )
  );
  v_expected_state := pg_catalog.jsonb_set(v_expected_state, ARRAY['weekly_metrics'], v_expected_array, true);

  -- Saved daily plans and their completion records are deliberately retained
  -- as immutable historical snapshots. All other top-level fields also remain
  -- exactly as stored because v_expected_state began as the locked current row.
  IF p_state IS DISTINCT FROM v_expected_state THEN
    RAISE EXCEPTION
      'The requested change is not an exact deletion of the selected course and its linked records. No Study data were changed.'
      USING ERRCODE = '22023';
  END IF;

  -- The complete pre-delete state is captured by the existing UPDATE backup
  -- trigger. Only after the strict replacement comparison do we enter the
  -- narrowly scoped trigger exception for immutable-history/entity guards.
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
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_study_mvp_course(text, jsonb, bigint)
  TO authenticated;

COMMIT;
