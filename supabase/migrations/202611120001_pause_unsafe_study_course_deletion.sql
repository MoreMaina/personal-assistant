BEGIN;

-- The existing RPC checks that one course is removed from `courses`, but its
-- transaction-local trigger bypass currently permits unrelated JSON state
-- changes in the same replacement payload. Disable direct execution until a
-- hardened function validates every changed collection and field.
REVOKE EXECUTE ON FUNCTION public.delete_user_study_mvp_course(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated;

COMMIT;
