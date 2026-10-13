 "use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AI_PREFERENCES,
  GEMINI_MODEL_OPTIONS,
  GEMINI_TTS_VOICE_OPTIONS,
  REASONING_PROVIDER_OPTIONS,
  SPEECH_PROVIDER_OPTIONS,
  loadAIPreferences,
  saveAIPreferences,
  type AIPreferences,
  isElevenLabsVoiceId,
  isGeminiReasoningModel,
  isGeminiTtsVoice,
  isReasoningProvider,
  isSpeechProvider,
} from "@/lib/assistantPreferences";

type ElevenLabsVoice = {
  id: string;
  name: string;
  category: string;
};

type AIProviderProfile = {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  selectedModel: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
};

type AIProviderForm = {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  selectedModel: string;
  enabled: boolean;
};

const EMPTY_PROVIDER_FORM: AIProviderForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  models: "",
  selectedModel: "",
  enabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAIProviderProfile(value: unknown): value is AIProviderProfile {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.baseUrl === "string" &&
    Array.isArray(value.models) &&
    value.models.every((model) => typeof model === "string") &&
    (typeof value.selectedModel === "string" || value.selectedModel === null) &&
    typeof value.enabled === "boolean" &&
    typeof value.hasApiKey === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function parseModelDraft(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\n,]+/)
      .map((model) => model.trim())
      .filter(Boolean),
  ));
}

function getApiError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export default function AISettingsPage() {
  const [preferences, setPreferences] = useState<AIPreferences>(
    DEFAULT_AI_PREFERENCES,
  );
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [elevenLabsVoicesLoading, setElevenLabsVoicesLoading] = useState(false);
  const [elevenLabsVoiceError, setElevenLabsVoiceError] = useState("");
  const [providerProfiles, setProviderProfiles] = useState<AIProviderProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState("");
  const [profilesStatus, setProfilesStatus] = useState("");
  const [providerForm, setProviderForm] = useState<AIProviderForm>({
    ...EMPTY_PROVIDER_FORM,
  });
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setPreferences(loadAIPreferences());
    setReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synthesis = window.speechSynthesis;
    const refreshVoices = () => setBrowserVoices(synthesis.getVoices());

    refreshVoices();
    synthesis.addEventListener("voiceschanged", refreshVoices);

    return () => {
      synthesis.removeEventListener("voiceschanged", refreshVoices);
    };
  }, []);

  useEffect(() => {
    if (!ready || preferences.speechProvider !== "elevenlabs") return;

    const controller = new AbortController();
    let active = true;

    async function loadElevenLabsVoices() {
      setElevenLabsVoicesLoading(true);
      setElevenLabsVoiceError("");

      try {
        const response = await fetch("/api/assistant/speech/voices", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Could not load ElevenLabs voices.";
          throw new Error(message);
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("The voice service returned an invalid response.");
        }

        const rawVoices = (payload as Record<string, unknown>).voices;
        if (!Array.isArray(rawVoices)) {
          throw new Error("The voice service returned an invalid voice list.");
        }

        const availableVoices = rawVoices.flatMap(
          (value): ElevenLabsVoice[] => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              return [];
            }

            const voice = value as Record<string, unknown>;
            if (
              !isElevenLabsVoiceId(voice.id) ||
              typeof voice.name !== "string" ||
              !voice.name.trim()
            ) {
              return [];
            }

            return [{
              id: voice.id,
              name: voice.name.trim().slice(0, 120),
              category:
                typeof voice.category === "string"
                  ? voice.category.slice(0, 60)
                  : "",
            }];
          },
        );

        if (!active) return;

        setElevenLabsVoices(availableVoices);
        if (availableVoices.length === 0) {
          setElevenLabsVoiceError(
            "No available ElevenLabs voices were returned for this account.",
          );
        }
      } catch (error) {
        if (!active) return;
        setElevenLabsVoiceError(
          error instanceof Error
            ? error.message
            : "Could not load ElevenLabs voices.",
        );
      } finally {
        if (active) setElevenLabsVoicesLoading(false);
      }
    }

    void loadElevenLabsVoices();

    return () => {
      active = false;
      controller.abort();
    };
  }, [ready, preferences.speechProvider]);

  const refreshProviderProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError("");

    try {
      const response = await fetch("/api/ai-providers", {
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getApiError(payload, "Provider profiles could not be loaded."),
        );
      }

      if (!isRecord(payload) || !Array.isArray(payload.profiles)) {
        throw new Error("The server returned an invalid provider list.");
      }

      const profiles = payload.profiles.filter(isAIProviderProfile);
      setProviderProfiles(profiles);

      if (profiles.length !== payload.profiles.length) {
        setProfilesError("Some provider entries were invalid and could not be displayed.");
      }
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "Provider profiles could not be loaded.",
      );
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void refreshProviderProfiles();
  }, [ready, refreshProviderProfiles]);

  async function discoverProviderModels() {
    setDiscoveringModels(true);
    setProfilesError("");
    setProfilesStatus("");

    try {
      const existing = providerProfiles.find(
        (profile) => profile.id === editingProfileId,
      );
      const useStoredCredential = Boolean(
        existing &&
        !providerForm.apiKey.trim() &&
        existing.baseUrl === providerForm.baseUrl.trim(),
      );

      if (!useStoredCredential &&
          (!providerForm.baseUrl.trim() || !providerForm.apiKey.trim())) {
        throw new Error(
          "Enter the provider HTTPS base URL and API key to discover models. For an unchanged saved profile, leave the key field blank.",
        );
      }

      const body = useStoredCredential
        ? { profileId: editingProfileId }
        : {
            baseUrl: providerForm.baseUrl,
            apiKey: providerForm.apiKey,
          };

      const response = await fetch("/api/ai-providers/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiError(payload, "Model discovery failed."),
        );
      }

      if (!isRecord(payload) ||
          !Array.isArray(payload.models) ||
          !payload.models.every((model) => typeof model === "string")) {
        throw new Error("The provider returned an invalid model list.");
      }

      const models = payload.models as string[];
      setProviderForm((current) => ({
        ...current,
        models: models.join("\n"),
        selectedModel:
          current.selectedModel && models.includes(current.selectedModel)
            ? current.selectedModel
            : models[0] ?? "",
      }));

      setProfilesStatus(
        `Discovered ${models.length} model${models.length === 1 ? "" : "s"}. The provider models endpoint responded successfully.`,
      );
    } catch (error) {
      setProfilesError(
        error instanceof Error ? error.message : "Model discovery failed.",
      );
    } finally {
      setDiscoveringModels(false);
    }
  }

  async function saveProviderProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    setProfilesError("");
    setProfilesStatus("");

    try {
      const models = parseModelDraft(providerForm.models);
      if (models.length === 0) {
        throw new Error("Discover models or enter at least one model ID.");
      }

      const selectedModel =
        providerForm.selectedModel || models[0];

      if (!models.includes(selectedModel)) {
        throw new Error("Select a model from the configured model list.");
      }

      if (!editingProfileId && !providerForm.apiKey.trim()) {
        throw new Error("An API key is required when creating a provider.");
      }

      const body: Record<string, unknown> = {
        name: providerForm.name,
        baseUrl: providerForm.baseUrl,
        models,
        selectedModel,
        enabled: providerForm.enabled,
      };

      if (!editingProfileId || providerForm.apiKey.trim()) {
        body.apiKey = providerForm.apiKey;
      }

      const response = await fetch(
        editingProfileId
          ? `/api/ai-providers/${encodeURIComponent(editingProfileId)}`
          : "/api/ai-providers",
        {
          method: editingProfileId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiError(payload, "The provider profile could not be saved."),
        );
      }

      setProfilesStatus(
        editingProfileId
          ? "Provider profile updated. The secret remains stored on the server."
          : "Provider profile saved. The secret remains stored on the server.",
      );
      setProviderForm({ ...EMPTY_PROVIDER_FORM });
      setEditingProfileId(null);
      await refreshProviderProfiles();
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "The provider profile could not be saved.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function editProviderProfile(profile: AIProviderProfile) {
    setEditingProfileId(profile.id);
    setProfilesError("");
    setProfilesStatus("");
    setProviderForm({
      name: profile.name,
      baseUrl: profile.baseUrl,
      apiKey: "",
      models: profile.models.join("\n"),
      selectedModel: profile.selectedModel ?? "",
      enabled: profile.enabled,
    });
  }

  async function setProviderEnabled(
    profile: AIProviderProfile,
    enabled: boolean,
  ) {
    setProfilesError("");
    setProfilesStatus("");

    try {
      const response = await fetch(
        `/api/ai-providers/${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiError(payload, "The provider status could not be changed."),
        );
      }

      setProfilesStatus(
        `${profile.name} ${enabled ? "enabled" : "disabled"}.`,
      );
      await refreshProviderProfiles();
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "The provider status could not be changed.",
      );
    }
  }

  async function deleteProviderProfile(profile: AIProviderProfile) {
    if (!window.confirm(
      `Delete the provider profile "${profile.name}"? This cannot be undone.`,
    )) {
      return;
    }

    setProfilesError("");
    setProfilesStatus("");

    try {
      const response = await fetch(
        `/api/ai-providers/${encodeURIComponent(profile.id)}`,
        { method: "DELETE" },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getApiError(payload, "The provider profile could not be deleted."),
        );
      }

      if (editingProfileId === profile.id) {
        setEditingProfileId(null);
        setProviderForm({ ...EMPTY_PROVIDER_FORM });
      }

      setProfilesStatus(`Deleted provider profile "${profile.name}".`);
      await refreshProviderProfiles();
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "The provider profile could not be deleted.",
      );
    }
  }

  function saveSettings() {
    try {
      const normalized = saveAIPreferences(preferences);
      setPreferences(normalized);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-1 pb-10">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.15em] opacity-70">
          Personal Assistant
        </p>
        <h1 className="text-3xl font-extrabold">AI &amp; Voice Settings</h1>
        <p className="max-w-2xl leading-relaxed opacity-80">
          Choose the AI provider and model that answer you, then select the
          service and voice that speak responses. Changes apply to future requests.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Reasoning model</h2>
          <p className="text-sm leading-relaxed opacity-75">
            Controls typed answers, spoken summaries, weekly reviews and task
            proposals. Your choice is validated on the server.
          </p>
        </div>

        <label htmlFor="reasoning-provider" className="block text-sm font-semibold">
          AI provider
        </label>
        <select
          id="reasoning-provider"
          value={preferences.reasoningProvider}
          disabled={!ready}
          onChange={(event) => {
            const provider = event.target.value;
            if (isReasoningProvider(provider)) {
              setPreferences((current) => ({
                ...current,
                reasoningProvider: provider,
              }));
              setSaved(false);
            }
          }}
          className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3"
        >
          {REASONING_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>

        <div className="rounded-xl bg-[var(--background)] p-3">
          <p className="font-semibold">
            {REASONING_PROVIDER_OPTIONS.find(
              (provider) => provider.id === preferences.reasoningProvider,
            )?.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed opacity-75">
            {REASONING_PROVIDER_OPTIONS.find(
              (provider) => provider.id === preferences.reasoningProvider,
            )?.description}
          </p>
        </div>

        {preferences.reasoningProvider === "gemini" ? (
          <>
            <label htmlFor="reasoning-model" className="block text-sm font-semibold">
              Gemini model
            </label>
            <select
              id="reasoning-model"
              value={preferences.reasoningModel}
              disabled={!ready}
              onChange={(event) => {
                const model = event.target.value;
                if (isGeminiReasoningModel(model)) {
                  setPreferences((current) => ({
                    ...current,
                    reasoningModel: model,
                  }));
                  setSaved(false);
                }
              }}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3"
            >
              {GEMINI_MODEL_OPTIONS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>

            <div className="rounded-xl bg-[var(--background)] p-3">
              <p className="font-semibold">
                {GEMINI_MODEL_OPTIONS.find(
                  (model) => model.id === preferences.reasoningModel,
                )?.label}
              </p>
              <p className="mt-1 text-sm leading-relaxed opacity-75">
                {GEMINI_MODEL_OPTIONS.find(
                  (model) => model.id === preferences.reasoningModel,
                )?.description}
              </p>
            </div>

            <p className="text-xs leading-relaxed opacity-70">
              Higher-capability models may cost more or have different quotas.
              Selecting a model does not increase your Google AI Studio limits.
            </p>
          </>
        ) : preferences.reasoningProvider === "custom" ? (
          <>
            <label htmlFor="custom-reasoning-profile" className="block text-sm font-semibold">
              Saved provider profile
            </label>
            <select
              id="custom-reasoning-profile"
              value={preferences.customProviderProfileId}
              disabled={!ready || profilesLoading}
              onChange={(event) => {
                const profile = providerProfiles.find(
                  (item) => item.id === event.target.value && item.enabled,
                );
                setPreferences((current) => ({
                  ...current,
                  customProviderProfileId: profile?.id ?? "",
                  customProviderModel:
                    profile?.selectedModel || profile?.models[0] || "",
                }));
                setSaved(false);
              }}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
            >
              <option value="">Choose an enabled saved profile</option>
              {providerProfiles.filter((profile) => profile.enabled).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>

            <label htmlFor="custom-reasoning-model" className="block text-sm font-semibold">
              Model
            </label>
            <select
              id="custom-reasoning-model"
              value={preferences.customProviderModel}
              disabled={
                !ready ||
                !providerProfiles.some(
                  (profile) =>
                    profile.id === preferences.customProviderProfileId &&
                    profile.enabled,
                )
              }
              onChange={(event) => {
                const model = event.target.value;
                const profile = providerProfiles.find(
                  (item) => item.id === preferences.customProviderProfileId &&
                    item.enabled,
                );
                if (profile?.models.includes(model)) {
                  setPreferences((current) => ({
                    ...current,
                    customProviderModel: model,
                  }));
                  setSaved(false);
                }
              }}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
            >
              {(
                providerProfiles.find(
                  (profile) =>
                    profile.id === preferences.customProviderProfileId &&
                    profile.enabled,
                )?.models ?? []
              ).map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>

            {!providerProfiles.some(
              (profile) =>
                profile.id === preferences.customProviderProfileId &&
                profile.enabled,
            ) && (
              <p className="text-sm leading-relaxed opacity-75">
                Add and enable a custom provider profile below before selecting it here.
              </p>
            )}

            <p className="text-xs leading-relaxed opacity-70">
              Only saved, enabled profiles are selectable. The server verifies
              that the profile belongs to your account and that the model is
              included in its saved model list.
            </p>
          </>
        ) : (
          <p className="text-sm leading-relaxed opacity-75">
            DeepSeek uses the model configured on the server through
            {" "}DEEPSEEK_MODEL. A server-side DEEPSEEK_API_KEY is required.
            Provider limits and pricing may apply. Streaming Voice Mode
            currently requires Gemini; switch back to Gemini to use it.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Custom AI providers</h2>
          <p className="text-sm leading-relaxed opacity-75">
            Configure HTTPS endpoints that expose the OpenAI-compatible API.
            API keys are encrypted on the server before being saved and are
            never returned to this page. Only public hostnames are accepted.
          </p>
        </div>

        {profilesLoading && (
          <p role="status" className="text-sm opacity-75">
            Loading saved provider profiles…
          </p>
        )}
        {profilesError && (
          <p role="alert" className="text-sm leading-relaxed">
            {profilesError}
          </p>
        )}
        {profilesStatus && (
          <p role="status" className="text-sm leading-relaxed">
            {profilesStatus}
          </p>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">
            {editingProfileId ? "Edit provider profile" : "Add a provider profile"}
          </h3>

          <form onSubmit={saveProviderProfile} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="custom-provider-name" className="block text-sm font-semibold">
                Provider name
              </label>
              <input
                id="custom-provider-name"
                value={providerForm.name}
                onChange={(event) => setProviderForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))}
                maxLength={80}
                required
                autoComplete="off"
                placeholder="My AI provider"
                disabled={savingProfile}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-provider-url" className="block text-sm font-semibold">
                HTTPS base URL
              </label>
              <input
                id="custom-provider-url"
                type="url"
                value={providerForm.baseUrl}
                onChange={(event) => setProviderForm((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))}
                required
                maxLength={2048}
                autoComplete="url"
                placeholder="https://api.example.com/v1"
                disabled={savingProfile}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
              />
              <p className="text-xs leading-relaxed opacity-70">
                Use the API base path, typically ending in /v1. Local-network,
                private-IP, metadata, and HTTP endpoints are blocked.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-provider-key" className="block text-sm font-semibold">
                API key
              </label>
              <input
                id="custom-provider-key"
                type="password"
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))}
                autoComplete="new-password"
                required={!editingProfileId}
                maxLength={8192}
                placeholder={editingProfileId ? "Leave blank to keep the saved key" : "Enter the provider API key"}
                disabled={savingProfile}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
              />
              <p className="text-xs leading-relaxed opacity-70">
                This value is sent only to the authenticated server endpoint.
                It is not saved in browser preferences or returned by profile APIs.
                Replace the key here only when you need to rotate it.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-provider-models" className="block text-sm font-semibold">
                Model IDs
              </label>
              <textarea
                id="custom-provider-models"
                value={providerForm.models}
                onChange={(event) => {
                  const models = parseModelDraft(event.target.value);
                  setProviderForm((current) => ({
                    ...current,
                    models: event.target.value,
                    selectedModel:
                      current.selectedModel && models.includes(current.selectedModel)
                        ? current.selectedModel
                        : models[0] ?? "",
                  }));
                }}
                rows={4}
                maxLength={22000}
                placeholder={"provider-model-fast\nprovider-model-reasoning"}
                disabled={savingProfile}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 font-mono text-sm disabled:opacity-60"
              />
              <p className="text-xs leading-relaxed opacity-70">
                Discover models below, or enter IDs manually, one per line.
                Comma-separated IDs are also accepted.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void discoverProviderModels()}
                disabled={discoveringModels || savingProfile}
                className="rounded-full border-2 border-[var(--border)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {discoveringModels ? "Checking provider…" : "Test connection and discover models"}
              </button>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={providerForm.enabled}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))}
                  disabled={savingProfile}
                  className="h-4 w-4"
                />
                Enable profile
              </label>
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-provider-selected-model" className="block text-sm font-semibold">
                Preferred model
              </label>
              <select
                id="custom-provider-selected-model"
                value={providerForm.selectedModel}
                onChange={(event) => setProviderForm((current) => ({
                  ...current,
                  selectedModel: event.target.value,
                }))}
                disabled={savingProfile || parseModelDraft(providerForm.models).length === 0}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
              >
                {parseModelDraft(providerForm.models).length === 0 ? (
                  <option value="">Discover or enter models first</option>
                ) : (
                  parseModelDraft(providerForm.models).map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!ready || savingProfile}
                className="rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {savingProfile
                  ? "Saving…"
                  : editingProfileId
                    ? "Save provider changes"
                    : "Save provider"}
              </button>
              {editingProfileId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfileId(null);
                    setProviderForm({ ...EMPTY_PROVIDER_FORM });
                    setProfilesError("");
                    setProfilesStatus("");
                  }}
                  disabled={savingProfile}
                  className="rounded-full border-2 border-[var(--border)] px-5 py-3 font-bold disabled:opacity-50"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <h3 className="font-semibold">Saved provider profiles</h3>
          {providerProfiles.length === 0 && !profilesLoading && (
            <p className="text-sm leading-relaxed opacity-75">
              No saved custom provider profiles. If this is a new setup, apply
              the provider-profile database migration and configure the server
              encryption key before saving API credentials.
            </p>
          )}

          {providerProfiles.map((profile) => (
            <div
              key={profile.id}
              className="space-y-3 rounded-xl border border-[var(--border)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">{profile.name}</p>
                  <p className="break-all text-xs opacity-70">{profile.baseUrl}</p>
                  <p className="text-sm leading-relaxed opacity-75">
                    {profile.models.length} model{profile.models.length === 1 ? "" : "s"}
                    {profile.selectedModel ? ` · Selected: ${profile.selectedModel}` : ""}
                    {" · "}
                    {profile.hasApiKey ? "Credential saved" : "Credential missing"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    profile.enabled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-[var(--background)] text-[var(--ink)]"
                  }`}
                >
                  {profile.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(event) => void setProviderEnabled(profile, event.target.checked)}
                    className="h-4 w-4"
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  onClick={() => editProviderProfile(profile)}
                  className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProviderProfile(profile)}
                  className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Speech provider</h2>
          <p className="text-sm leading-relaxed opacity-75">
            This choice controls spoken summaries and Voice Mode replies.
            Browser speech is also used as a fallback if generated audio fails.
          </p>
        </div>

        <label htmlFor="speech-provider" className="block text-sm font-semibold">
          Voice service
        </label>
        <select
          id="speech-provider"
          value={preferences.speechProvider}
          disabled={!ready}
          onChange={(event) => {
            if (isSpeechProvider(event.target.value)) {
              setPreferences((current) => ({
                ...current,
                speechProvider: event.target.value as AIPreferences["speechProvider"],
              }));
              setSaved(false);
            }
          }}
          className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3"
        >
          {SPEECH_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>

        <div className="rounded-xl bg-[var(--background)] p-3">
          <p className="font-semibold">
            {SPEECH_PROVIDER_OPTIONS.find(
              (provider) => provider.id === preferences.speechProvider,
            )?.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed opacity-75">
            {SPEECH_PROVIDER_OPTIONS.find(
              (provider) => provider.id === preferences.speechProvider,
            )?.description}
          </p>
        </div>

        {preferences.speechProvider === "gemini" && (
        <div className="space-y-2">
          <label htmlFor="gemini-tts-voice" className="block text-sm font-semibold">
            Gemini voice
          </label>
          <select
            id="gemini-tts-voice"
            value={preferences.geminiTtsVoice}
            disabled={!ready}
            onChange={(event) => {
              const voice = event.target.value;
              if (isGeminiTtsVoice(voice)) {
                setPreferences((current) => ({
                  ...current,
                  geminiTtsVoice: voice,
                }));
                setSaved(false);
              }
            }}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3"
          >
            {GEMINI_TTS_VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed opacity-70">
            Select one of Gemini&apos;s built-in voices. Availability and quotas
            depend on the configured TTS model and Google project.
          </p>
        </div>
      )}

      {preferences.speechProvider === "elevenlabs" && (
        <div className="space-y-2">
          <label htmlFor="elevenlabs-voice" className="block text-sm font-semibold">
            ElevenLabs voice
          </label>
          <select
            id="elevenlabs-voice"
            value={preferences.elevenLabsVoiceId}
            disabled={!ready || elevenLabsVoicesLoading || elevenLabsVoices.length === 0}
            onChange={(event) => {
              if (isElevenLabsVoiceId(event.target.value)) {
                setPreferences((current) => ({
                  ...current,
                  elevenLabsVoiceId: event.target.value,
                }));
                setSaved(false);
              }
            }}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 disabled:opacity-60"
          >
            {!elevenLabsVoices.some(
              (voice) => voice.id === preferences.elevenLabsVoiceId,
            ) && (
              <option value={preferences.elevenLabsVoiceId}>
                Previously saved voice (not in the current list)
              </option>
            )}
            {elevenLabsVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}{voice.category ? ` — ${voice.category}` : ""}
              </option>
            ))}
          </select>
          {elevenLabsVoicesLoading && (
            <p role="status" className="text-sm opacity-75">
              Loading voices from your account…
            </p>
          )}
          {!elevenLabsVoicesLoading && elevenLabsVoiceError && (
            <p role="status" className="text-sm leading-relaxed opacity-80">
              {elevenLabsVoiceError}
            </p>
          )}
          {!elevenLabsVoicesLoading &&
            !elevenLabsVoiceError &&
            elevenLabsVoices.length > 0 && (
              <p className="text-xs leading-relaxed opacity-70">
                Choices are loaded from your authenticated ElevenLabs account.
              </p>
            )}
        </div>
      )}

      {preferences.speechProvider === "browser" && (
        <div className="space-y-2">
          <label htmlFor="browser-voice" className="block text-sm font-semibold">
            Device voice
          </label>
          <select
            id="browser-voice"
            value={preferences.browserVoiceURI}
            disabled={!ready}
            onChange={(event) => {
              setPreferences((current) => ({
                ...current,
                browserVoiceURI: event.target.value,
              }));
              setSaved(false);
            }}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3"
          >
            <option value="">System default voice</option>
            {preferences.browserVoiceURI &&
              !browserVoices.some(
                (voice) => voice.voiceURI === preferences.browserVoiceURI,
              ) && (
                <option value={preferences.browserVoiceURI}>
                  Previously saved voice (unavailable on this device)
                </option>
              )}
            {browserVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang}){voice.default ? " — default" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed opacity-70">
            {browserVoices.length > 0
              ? "These voices are supplied by this device or browser. The available list varies by platform."
              : "No device voices have loaded yet. Try another speech provider if this device does not supply system voices."}
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed opacity-70">
        API keys stay on the server in your environment settings. Your
        preferences are saved in this browser only and are not synced across
        devices. Provider quotas still apply; a fallback cannot guarantee
        generated speech when a provider is unavailable.
      </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveSettings}
          disabled={!ready}
          className="rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          Save settings
        </button>
        {saved && (
          <p role="status" className="text-sm font-semibold">
            Saved on this device. Your next Copilot request will use these settings.
          </p>
        )}
      </div>
    </main>
  );
}
