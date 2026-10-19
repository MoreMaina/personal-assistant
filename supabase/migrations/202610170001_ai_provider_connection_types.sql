-- Identify the API protocol used by each user-configured connection.
-- Existing profiles remain OpenAI-compatible chat connections.
-- These values identify server adapters; they are not preconfigured providers.

alter table public.user_ai_provider_profiles
  add column provider_type text not null default 'openai_compatible'
  constraint user_ai_provider_profiles_provider_type_check
  check (
    provider_type in (
      'openai_compatible',
      'google_generative_language',
      'elevenlabs_tts'
    )
  );

comment on column public.user_ai_provider_profiles.provider_type is
  'API protocol for this user-configured connection. Supported adapters determine its capabilities.';
