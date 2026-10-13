-- User-owned AI provider profiles.
-- API keys are stored only as AES-256-GCM ciphertext created by the server.
-- Do not store plaintext API keys in this table.

create table public.user_ai_provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  base_url text not null check (char_length(base_url) between 10 and 2048),
  encrypted_api_key text not null
    check (
      char_length(encrypted_api_key) between 45 and 16384
      and encrypted_api_key ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'
    ),
  models jsonb not null default '[]'::jsonb
    check (jsonb_typeof(models) = 'array'),
  selected_model text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ai_provider_selected_model_length
    check (
      selected_model is null or
      char_length(selected_model) between 1 and 200
    )
);

create unique index user_ai_provider_profiles_user_name_key
  on public.user_ai_provider_profiles (user_id, lower(name));

alter table public.user_ai_provider_profiles enable row level security;

create policy "Users can read their own AI provider profiles"
  on public.user_ai_provider_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own AI provider profiles"
  on public.user_ai_provider_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own AI provider profiles"
  on public.user_ai_provider_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own AI provider profiles"
  on public.user_ai_provider_profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.user_ai_provider_profiles to authenticated;

comment on table public.user_ai_provider_profiles is
  'Per-user OpenAI-compatible AI provider settings. encrypted_api_key must contain server-generated ciphertext, never plaintext.';
comment on column public.user_ai_provider_profiles.encrypted_api_key is
  'AES-256-GCM ciphertext encrypted by the Next.js server with AI_PROVIDER_ENCRYPTION_KEY.';
