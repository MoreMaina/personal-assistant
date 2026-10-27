-- Google Calendar read-only integration.
-- OAuth refresh tokens are AES-256-GCM ciphertext; raw tokens are never stored.

create table public.user_google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null
    check (
      char_length(encrypted_refresh_token) between 45 and 16384
      and encrypted_refresh_token ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'
    ),
  google_email text
    check (google_email is null or char_length(google_email) <= 320),
  scopes text[] not null default '{}'::text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_google_calendar_connections
  enable row level security;

-- No direct table access from browser-facing roles. Access is through
-- narrowly scoped functions that derive the user from auth.uid().
revoke all on table public.user_google_calendar_connections
  from public, anon, authenticated;

comment on table public.user_google_calendar_connections is
  'Per-user Google Calendar OAuth connection. Refresh tokens must be encrypted by the server.';

comment on column public.user_google_calendar_connections.encrypted_refresh_token is
  'AES-256-GCM ciphertext encrypted on the server with AI_PROVIDER_ENCRYPTION_KEY.';

create or replace function public.get_my_google_calendar_connection()
returns table (
  google_email text,
  scopes text[],
  connected_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    c.google_email,
    c.scopes,
    c.connected_at,
    c.updated_at
  from public.user_google_calendar_connections as c
  where c.user_id = (select auth.uid());
$function$;

create or replace function public.get_my_google_calendar_refresh_token()
returns table (
  encrypted_refresh_token text,
  google_email text,
  scopes text[],
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    c.encrypted_refresh_token,
    c.google_email,
    c.scopes,
    c.connected_at
  from public.user_google_calendar_connections as c
  where c.user_id = (select auth.uid());
$function$;

create or replace function public.save_my_google_calendar_connection(
  p_encrypted_refresh_token text,
  p_google_email text,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_encrypted_refresh_token is null
     or p_encrypted_refresh_token !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$' then
    raise exception 'An encrypted refresh token is required.';
  end if;

  if p_scopes is null
     or not (
       p_scopes @> array[
         'https://www.googleapis.com/auth/calendar.events.readonly',
         'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
       ]::text[]
     ) then
    raise exception 'The required read-only Calendar permissions are missing.';
  end if;

  insert into public.user_google_calendar_connections (
    user_id,
    encrypted_refresh_token,
    google_email,
    scopes
  )
  values (
    v_user_id,
    p_encrypted_refresh_token,
    nullif(p_google_email, ''),
    p_scopes
  )
  on conflict (user_id) do update set
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    google_email = excluded.google_email,
    scopes = excluded.scopes,
    updated_at = now();
end;
$function$;

create or replace function public.delete_my_google_calendar_connection()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.user_google_calendar_connections
  where user_id = (select auth.uid());
end;
$function$;

revoke all on function public.get_my_google_calendar_connection()
  from public, anon;
revoke all on function public.get_my_google_calendar_refresh_token()
  from public, anon;
revoke all on function public.save_my_google_calendar_connection(text, text, text[])
  from public, anon;
revoke all on function public.delete_my_google_calendar_connection()
  from public, anon;

grant execute on function public.get_my_google_calendar_connection()
  to authenticated;
grant execute on function public.get_my_google_calendar_refresh_token()
  to authenticated;
grant execute on function public.save_my_google_calendar_connection(text, text, text[])
  to authenticated;
grant execute on function public.delete_my_google_calendar_connection()
  to authenticated;
