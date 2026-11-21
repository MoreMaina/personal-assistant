BEGIN;

-- One push subscription per browser/device endpoint.
CREATE TABLE public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  endpoint text NOT NULL
    CHECK (
      char_length(endpoint) BETWEEN 1 AND 2048
      AND endpoint LIKE 'https://fcm.googleapis.com/%'
    ),

  endpoint_hash text NOT NULL UNIQUE
    CHECK (endpoint_hash ~ '^[a-f0-9]{64}$'),

  p256dh_key text NOT NULL
    CHECK (p256dh_key ~ '^[A-Za-z0-9_-]{80,100}$'),

  auth_key text NOT NULL
    CHECK (auth_key ~ '^[A-Za-z0-9_-]{20,30}$'),

  device_name text,
  time_zone text NOT NULL DEFAULT 'UTC'
    CHECK (char_length(time_zone) BETWEEN 1 AND 100),

  enabled boolean NOT NULL DEFAULT true,

  -- Class notifications are deliberately OFF by default.
  class_reminders_enabled boolean NOT NULL DEFAULT false,

  calendar_reminders_enabled boolean NOT NULL DEFAULT true,
  google_calendar_enabled boolean NOT NULL DEFAULT true,
  task_reminders_enabled boolean NOT NULL DEFAULT true,
  study_reminders_enabled boolean NOT NULL DEFAULT true,

  event_reminder_minutes smallint[] NOT NULL
    DEFAULT ARRAY[30, 10]::smallint[]
    CHECK (
      cardinality(event_reminder_minutes) <= 3
      AND event_reminder_minutes <@ ARRAY[10, 30, 60]::smallint[]
    ),

  class_reminder_minutes smallint[] NOT NULL
    DEFAULT ARRAY[30, 10]::smallint[]
    CHECK (
      cardinality(class_reminder_minutes) <= 3
      AND class_reminder_minutes <@ ARRAY[10, 30, 60]::smallint[]
    ),

  all_day_event_time time NOT NULL DEFAULT '09:00',
  task_digest_time time NOT NULL DEFAULT '09:00',
  study_digest_time time NOT NULL DEFAULT '08:00',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_push_subscriptions_user_idx
  ON public.user_push_subscriptions(user_id);

-- Minimal delivery records prevent duplicate reminders.
-- Notification content itself is not stored here.
CREATE TABLE public.push_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subscription_id uuid NOT NULL
    REFERENCES public.user_push_subscriptions(id) ON DELETE CASCADE,

  notification_key text NOT NULL
    CHECK (char_length(notification_key) BETWEEN 1 AND 512),

  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT push_notification_deliveries_unique
    UNIQUE (subscription_id, notification_key)
);

CREATE INDEX push_notification_deliveries_created_idx
  ON public.push_notification_deliveries(created_at);

-- Device owners can manage only their own subscriptions.
ALTER TABLE public.user_push_subscriptions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push subscriptions"
  ON public.user_push_subscriptions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create their own push subscriptions"
  ON public.user_push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON public.user_push_subscriptions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON public.user_push_subscriptions
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_push_subscriptions TO authenticated;

GRANT ALL
  ON public.user_push_subscriptions TO service_role;

-- Delivery history is only accessible to the server-side dispatcher.
ALTER TABLE public.push_notification_deliveries
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
  ON public.push_notification_deliveries
  FROM PUBLIC, anon, authenticated;

GRANT ALL
  ON public.push_notification_deliveries TO service_role;

COMMENT ON TABLE public.user_push_subscriptions IS
  'Per-device Android/browser push subscriptions and notification preferences.';

COMMENT ON TABLE public.push_notification_deliveries IS
  'Idempotency records for successfully delivered push notifications.';


-- Delivery reservation and retry support.
ALTER TABLE public.push_notification_deliveries
  ALTER COLUMN sent_at DROP NOT NULL,
  ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE public.push_notification_deliveries
  ADD COLUMN status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  ADD COLUMN last_error text
    CHECK (last_error IS NULL OR char_length(last_error) <= 500);

CREATE INDEX push_notification_deliveries_retry_idx
  ON public.push_notification_deliveries(status, lease_expires_at)
  WHERE status <> 'sent';

-- Atomically reserve a reminder before attempting delivery.
CREATE OR REPLACE FUNCTION public.claim_push_notification_delivery(
  p_subscription_id uuid,
  p_notification_key text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_delivery_id uuid;
BEGIN
  IF p_lease_seconds < 15 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'Invalid delivery lease duration.';
  END IF;

  INSERT INTO public.push_notification_deliveries AS existing (
    subscription_id,
    notification_key,
    status,
    lease_expires_at,
    attempts
  )
  VALUES (
    p_subscription_id,
    p_notification_key,
    'pending',
    pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => p_lease_seconds),
    1
  )
  ON CONFLICT (subscription_id, notification_key)
  DO UPDATE SET
    status = 'pending',
    lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => p_lease_seconds),
    attempts = existing.attempts + 1,
    last_error = NULL
  WHERE existing.status <> 'sent'
    AND (
      existing.lease_expires_at IS NULL
      OR existing.lease_expires_at < pg_catalog.clock_timestamp()
    )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_push_notification_sent(
  p_delivery_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.push_notification_deliveries
  SET
    status = 'sent',
    sent_at = pg_catalog.clock_timestamp(),
    lease_expires_at = NULL,
    last_error = NULL
  WHERE id = p_delivery_id
    AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_push_notification_failed(
  p_delivery_id uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.push_notification_deliveries
  SET
    status = 'failed',
    lease_expires_at = NULL,
    last_error = pg_catalog.left(
      COALESCE(p_error, 'Push delivery failed.'),
      500
    )
  WHERE id = p_delivery_id
    AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$function$;

-- These privileged operations are only for the server-side dispatcher.
REVOKE ALL ON FUNCTION
  public.claim_push_notification_delivery(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.mark_push_notification_sent(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.mark_push_notification_failed(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.claim_push_notification_delivery(uuid, text, integer)
  TO service_role;

GRANT EXECUTE ON FUNCTION
  public.mark_push_notification_sent(uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION
  public.mark_push_notification_failed(uuid, text)
  TO service_role;

COMMIT;
