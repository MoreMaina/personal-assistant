-- Keep speech-capable model IDs separate from reasoning model IDs.
-- Existing profiles receive an empty list and remain compatible.

alter table public.user_ai_provider_profiles
  add column speech_models jsonb not null default '[]'::jsonb
  constraint user_ai_provider_profiles_speech_models_check
  check (jsonb_typeof(speech_models) = 'array');

comment on column public.user_ai_provider_profiles.speech_models is
  'Speech-capable model IDs discovered for this connection. API keys must never be stored here.';
