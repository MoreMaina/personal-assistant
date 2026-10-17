"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_AI_PREFERENCES,
  isElevenLabsVoiceId,
  loadAIPreferences,
  saveAIPreferences,
  type AIPreferences,
} from "@/lib/assistantPreferences";
import {
  AI_PROVIDER_TYPE_OPTIONS,
  isAIProviderType,
  supportsAICapability,
  type AIProviderType,
  type AICapability,
} from "@/lib/aiProviderTypes";

type Voice = { id: string; name: string; category: string };
type Profile = {
  id: string; providerType: AIProviderType; name: string; baseUrl: string;
  models: string[]; speechModels: string[]; selectedModel: string | null;
  enabled: boolean; hasApiKey: boolean; createdAt: string; updatedAt: string;
};
type ProviderForm = {
  providerType: AIProviderType | ""; name: string; baseUrl: string;
  apiKey: string; models: string; speechModels: string;
  selectedModel: string; enabled: boolean;
};
type Placement = "reasoning" | "speech";

const EMPTY_FORM: ProviderForm = {
  providerType: "", name: "", baseUrl: "", apiKey: "",
  models: "", speechModels: "", selectedModel: "", enabled: true,
};
const BASE_URLS: Partial<Record<AIProviderType, string>> = {
  google_generative_language: "https://generativelanguage.googleapis.com/v1beta",
  elevenlabs_tts: "https://api.elevenlabs.io/v1",
};

function record(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}
function isProfile(v: unknown): v is Profile {
  return Boolean(record(v) && typeof v.id === "string" &&
    isAIProviderType(v.providerType) && typeof v.name === "string" &&
    typeof v.baseUrl === "string" && Array.isArray(v.models) &&
    v.models.every((m) => typeof m === "string") &&
    Array.isArray(v.speechModels) && v.speechModels.every((m) => typeof m === "string") &&
    (typeof v.selectedModel === "string" || v.selectedModel === null) &&
    typeof v.enabled === "boolean" && typeof v.hasApiKey === "boolean" &&
    typeof v.createdAt === "string" && typeof v.updatedAt === "string");
}
function modelsFrom(text: string): string[] {
  return Array.from(new Set(text.split(/[\n,]+/).map((m) => m.trim()).filter(Boolean)));
}
function apiError(v: unknown, fallback: string): string {
  return record(v) && typeof v.error === "string" ? v.error : fallback;
}
function supports(p: Profile, c: AICapability): boolean {
  return supportsAICapability(p.providerType, c);
}
function canReason(p: Profile): boolean {
  return p.enabled && supports(p, "reasoning") && p.models.length > 0;
}
function canSpeak(p: Profile): boolean {
  return p.enabled && supports(p, "speech") && p.speechModels.length > 0;
}

export default function AISettingsPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<AIPreferences>(DEFAULT_AI_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>("reasoning");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>({ ...EMPTY_FORM });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const reasoningOptions = profiles.filter(canReason);
  const speechOptions = profiles.filter(canSpeak);
  const reasoning = reasoningOptions.find((p) => p.id === preferences.reasoningConnectionId);
  const speech = speechOptions.find((p) => p.id === preferences.speechConnectionId);
  const knownType = isAIProviderType(form.providerType);
  const supportsReasoning = knownType &&
    supportsAICapability(form.providerType as AIProviderType, "reasoning");
  const supportsSpeech = knownType &&
    supportsAICapability(form.providerType as AIProviderType, "speech");

  useEffect(() => {
    setPreferences(loadAIPreferences());
    setReady(true);
  }, []);

  const refreshProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    setError("");
    try {
      const response = await fetch("/api/ai-providers", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Saved connections could not be loaded."));
      if (!record(payload) || !Array.isArray(payload.profiles)) {
        throw new Error("The server returned an invalid connection list.");
      }
      const next = payload.profiles.filter(isProfile);
      setProfiles(next);
      if (next.length !== payload.profiles.length) {
        setError("Some connections could not be displayed. Confirm that the connection migrations have been applied.");
      }
      setPreferences((old) => {
        const r = next.find((p) => p.id === old.reasoningConnectionId && canReason(p));
        const s = next.find((p) => p.id === old.speechConnectionId && canSpeak(p));
        return {
          ...old,
          reasoningConnectionId: r?.id ?? "",
          reasoningModel: r?.models.includes(old.reasoningModel) ? old.reasoningModel
            : r?.selectedModel && r.models.includes(r.selectedModel) ? r.selectedModel : r?.models[0] ?? "",
          speechConnectionId: s?.id ?? "",
          speechModel: s?.speechModels.includes(old.speechModel) ? old.speechModel : s?.speechModels[0] ?? "",
          speechVoiceId: s ? old.speechVoiceId : "",
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved connections could not be loaded.");
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void refreshProfiles();
  }, [ready, refreshProfiles]);

  useEffect(() => {
    const id = preferences.speechConnectionId;
    const profile = profiles.find((p) => p.id === id && canSpeak(p));
    if (!ready || !id || !profile) {
      setVoices([]);
      setVoiceError("");
      setLoadingVoices(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    async function loadVoices() {
      setLoadingVoices(true);
      setVoiceError("");
      try {
        const response = await fetch(
          "/api/assistant/speech/voices?providerProfileId=" + encodeURIComponent(id),
          { cache: "no-store", signal: controller.signal },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiError(payload, "Voices could not be loaded."));
        if (!record(payload) || !Array.isArray(payload.voices)) {
          throw new Error("The connection returned an invalid voice list.");
        }
        const next = payload.voices.flatMap((v): Voice[] => {
          if (!record(v) || !isElevenLabsVoiceId(v.id) ||
            typeof v.name !== "string" || !v.name.trim()) return [];
          return [{
            id: v.id, name: v.name.trim().slice(0, 120),
            category: typeof v.category === "string" ? v.category.slice(0, 60) : "",
          }];
        });
        if (!active) return;
        setVoices(next);
        if (!next.length) setVoiceError("No voices were returned for this connection.");
        else setPreferences((old) => {
          if (old.speechConnectionId !== id || next.some((v) => v.id === old.speechVoiceId)) return old;
          return { ...old, speechVoiceId: next[0].id };
        });
      } catch (e) {
        if (active) setVoiceError(e instanceof Error ? e.message : "Voices could not be loaded.");
      } finally {
        if (active) setLoadingVoices(false);
      }
    }
    void loadVoices();
    return () => { active = false; controller.abort(); };
  }, [ready, preferences.speechConnectionId, profiles]);

  function updatePreferences(patch: Partial<AIPreferences>) {
    setPreferences((old) => ({ ...old, ...patch }));
  }
  function addConnection(target: Placement) {
    setPlacement(target);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setStatus("");
    setFormOpen(true);
  }

  async function testConnection() {
    if (!knownType) {
      setError("Choose a connection protocol first.");
      return;
    }
    setTesting(true);
    setError("");
    setStatus("");
    try {
      const old = profiles.find((p) => p.id === editingId);
      const useSavedKey = Boolean(old && old.providerType === form.providerType &&
        old.baseUrl === form.baseUrl.trim() && !form.apiKey.trim());
      if (!useSavedKey && (!form.baseUrl.trim() || !form.apiKey.trim())) {
        throw new Error("Enter the HTTPS base URL and API key. For an unchanged saved connection, leave the key blank.");
      }
      const body = useSavedKey ? { profileId: editingId } : {
        providerType: form.providerType, baseUrl: form.baseUrl, apiKey: form.apiKey,
      };
      const response = await fetch("/api/ai-providers/discover", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Connection test failed."));
      if (!record(payload)) throw new Error("The connection returned an invalid model list.");
      const models = Array.isArray(payload.models) && payload.models.every((v) => typeof v === "string")
        ? payload.models as string[] : [];
      const speechModels = Array.isArray(payload.speechModels) && payload.speechModels.every((v) => typeof v === "string")
        ? payload.speechModels as string[] : [];
      setForm((old) => ({
        ...old,
        models: models.join("\n"),
        speechModels: speechModels.join("\n"),
        selectedModel: old.selectedModel && models.includes(old.selectedModel) ? old.selectedModel : models[0] ?? "",
      }));
      setStatus("Connection test passed. Found " + models.length +
        " reasoning model(s) and " + speechModels.length + " speech model(s). Review the model IDs below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      if (!knownType) throw new Error("Choose a connection protocol.");
      if (placement === "reasoning" && !supportsReasoning) {
        throw new Error("Choose a protocol that supports reasoning for this section.");
      }
      if (placement === "speech" && !supportsSpeech) {
        throw new Error("Choose a protocol that supports speech for this section.");
      }
      const providerType = form.providerType as AIProviderType;
      const models = supportsReasoning ? modelsFrom(form.models) : [];
      const speechModels = supportsSpeech ? modelsFrom(form.speechModels) : [];
      const selectedModel = supportsReasoning ? form.selectedModel || models[0] || "" : "";
      if (placement === "reasoning" && !models.length) {
        throw new Error("Discover or enter at least one reasoning model ID.");
      }
      if (placement === "speech" && !speechModels.length) {
        throw new Error("Discover or enter at least one speech model ID.");
      }
      if (selectedModel && !models.includes(selectedModel)) {
        throw new Error("Select a preferred reasoning model from the list.");
      }
      if (!editingId && !form.apiKey.trim()) {
        throw new Error("An API key is required for a new connection.");
      }
      const old = profiles.find((p) => p.id === editingId);
      if (editingId && !form.apiKey.trim() && old &&
          (old.providerType !== providerType || old.baseUrl !== form.baseUrl.trim())) {
        throw new Error("Enter the API key when changing the protocol or base URL.");
      }
      if (!form.baseUrl.trim()) throw new Error("Enter the HTTPS base URL.");

      const body: Record<string, unknown> = {
        providerType, name: form.name, baseUrl: form.baseUrl,
        models, speechModels, selectedModel: selectedModel || null, enabled: form.enabled,
      };
      if (!editingId || form.apiKey.trim()) body.apiKey = form.apiKey;
      const response = await fetch(
        editingId ? "/api/ai-providers/" + encodeURIComponent(editingId) : "/api/ai-providers",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "The connection could not be saved."));
      const id = record(payload) && record(payload.profile) && typeof payload.profile.id === "string"
        ? payload.profile.id : editingId;

      if (form.enabled && id && placement === "reasoning") {
        updatePreferences({ reasoningConnectionId: id, reasoningModel: selectedModel || models[0] || "" });
      } else if (form.enabled && id && placement === "speech") {
        updatePreferences({ speechConnectionId: id, speechModel: speechModels[0] || "", speechVoiceId: "" });
      }
      setStatus(editingId
        ? "Connection updated; its API key remains encrypted on the server."
        : "Connection saved; its API key remains encrypted on the server.");
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      setFormOpen(false);
      await refreshProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The connection could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function editConnection(p: Profile) {
    setEditingId(p.id);
    setPlacement(supports(p, "reasoning") ? "reasoning" : "speech");
    setForm({
      providerType: p.providerType, name: p.name, baseUrl: p.baseUrl, apiKey: "",
      models: p.models.join("\n"), speechModels: p.speechModels.join("\n"),
      selectedModel: p.selectedModel ?? p.models[0] ?? "", enabled: p.enabled,
    });
    setFormOpen(true);
    setError("");
    setStatus("");
  }

  async function setEnabled(p: Profile, enabled: boolean) {
    try {
      const response = await fetch("/api/ai-providers/" + encodeURIComponent(p.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Connection status could not be changed."));
      if (!enabled) setPreferences((old) => ({
        ...old,
        reasoningConnectionId: old.reasoningConnectionId === p.id ? "" : old.reasoningConnectionId,
        reasoningModel: old.reasoningConnectionId === p.id ? "" : old.reasoningModel,
        speechConnectionId: old.speechConnectionId === p.id ? "" : old.speechConnectionId,
        speechModel: old.speechConnectionId === p.id ? "" : old.speechModel,
        speechVoiceId: old.speechConnectionId === p.id ? "" : old.speechVoiceId,
      }));
      setStatus(p.name + (enabled ? " enabled." : " disabled."));
      await refreshProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection status could not be changed.");
    }
  }

  async function deleteConnection(p: Profile) {
    if (!window.confirm('Delete the connection "' + p.name + '"? This cannot be undone.')) return;
    try {
      const response = await fetch("/api/ai-providers/" + encodeURIComponent(p.id), { method: "DELETE" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Connection could not be deleted."));
      setPreferences((old) => ({
        ...old,
        reasoningConnectionId: old.reasoningConnectionId === p.id ? "" : old.reasoningConnectionId,
        reasoningModel: old.reasoningConnectionId === p.id ? "" : old.reasoningModel,
        speechConnectionId: old.speechConnectionId === p.id ? "" : old.speechConnectionId,
        speechModel: old.speechConnectionId === p.id ? "" : old.speechModel,
        speechVoiceId: old.speechConnectionId === p.id ? "" : old.speechVoiceId,
      }));
      if (editingId === p.id) { setEditingId(null); setFormOpen(false); setForm({ ...EMPTY_FORM }); }
      setStatus('Deleted connection "' + p.name + '".');
      await refreshProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection could not be deleted.");
    }
  }

  function saveSettings() {
    try {
      saveAIPreferences(preferences);
      router.back();
    } catch {
      setError("Settings could not be saved in this browser.");
    }
  }

  const formPanel = formOpen ? <div className="space-y-4 rounded-xl border-2 border-[var(--primary)]/40 bg-[var(--background)] p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">{editingId ? "Edit connection" : "Add a connection"}</h3>
        <p className="text-sm opacity-75">Choose the protocol and name this connection yourself.</p>
      </div>
      <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }} className="rounded-full border border-[var(--border)] px-3 py-2 text-sm">Close</button>
    </div>
    <form onSubmit={saveConnection} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="connection-type" className="block text-sm font-semibold">Connection protocol</label>
        <select id="connection-type" required value={form.providerType} disabled={saving} onChange={(e) => {
          const value = e.target.value;
          if (!isAIProviderType(value)) {
            setForm((old) => ({ ...old, providerType: "", models: "", speechModels: "", selectedModel: "" }));
            return;
          }
          setForm((old) => {
            const baseUrl = BASE_URLS[value] ?? (old.providerType === value ? old.baseUrl : "");
            return {
              ...old, providerType: value, baseUrl,
              models: supportsAICapability(value, "reasoning") ? old.models : "",
              speechModels: supportsAICapability(value, "speech") ? old.speechModels : "",
              selectedModel: supportsAICapability(value, "reasoning") ? old.selectedModel : "",
            };
          });
        }} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <option value="">Choose a connection protocol</option>
          {AI_PROVIDER_TYPE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {knownType && <p className="text-xs opacity-70">Supports {[supportsReasoning ? "reasoning" : "", supportsSpeech ? "speech" : ""].filter(Boolean).join(" and ")}.</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="connection-name" className="block text-sm font-semibold">Connection name</label>
        <input id="connection-name" value={form.name} onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))} required maxLength={80} autoComplete="off" placeholder="Give this connection a name" disabled={saving} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3" />
      </div>
      <div className="space-y-1">
        <label htmlFor="connection-url" className="block text-sm font-semibold">HTTPS base URL</label>
        <input id="connection-url" type="url" value={form.baseUrl} onChange={(e) => setForm((old) => ({ ...old, baseUrl: e.target.value }))} required maxLength={2048} autoComplete="url" placeholder={form.providerType === "google_generative_language" ? BASE_URLS.google_generative_language : form.providerType === "elevenlabs_tts" ? BASE_URLS.elevenlabs_tts : "https://api.example.com/v1"} disabled={saving} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3" />
        <p className="text-xs opacity-70">Use HTTPS and a public hostname. Private networks and unsafe endpoints are blocked.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="connection-key" className="block text-sm font-semibold">API key</label>
        <input id="connection-key" type="password" value={form.apiKey} onChange={(e) => setForm((old) => ({ ...old, apiKey: e.target.value }))} required={!editingId} maxLength={8192} autoComplete="new-password" placeholder={editingId ? "Leave blank to keep the saved key" : "Enter the API key"} disabled={saving} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3" />
        <p className="text-xs opacity-70">Encrypted on the server; the secret is never returned to this page.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void testConnection()} disabled={testing || saving || !knownType} className="rounded-full border-2 border-[var(--border)] px-4 py-2.5 text-sm font-bold">{testing ? "Testing connection…" : "Test connection and discover models"}</button>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((old) => ({ ...old, enabled: e.target.checked }))} disabled={saving} className="h-4 w-4" />Enable connection</label>
      </div>
      <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
        <h4 className="font-bold">Model IDs</h4>
        {!knownType && <p className="text-sm opacity-70">Choose a protocol to see the model fields.</p>}
        {supportsReasoning && <div className="space-y-2">
          <label htmlFor="reasoning-model-ids" className="block text-sm font-semibold">Reasoning model IDs</label>
          <textarea id="reasoning-model-ids" value={form.models} onChange={(e) => {
            const items = modelsFrom(e.target.value);
            setForm((old) => ({ ...old, models: e.target.value, selectedModel: old.selectedModel && items.includes(old.selectedModel) ? old.selectedModel : items[0] ?? "" }));
          }} rows={3} maxLength={22000} placeholder={"model-fast\nmodel-reasoning"} disabled={saving} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-mono text-sm" />
          {modelsFrom(form.models).length > 0 && <>
            <label htmlFor="preferred-model" className="block text-sm font-semibold">Preferred reasoning model</label>
            <select id="preferred-model" value={form.selectedModel} onChange={(e) => setForm((old) => ({ ...old, selectedModel: e.target.value }))} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3">
              {modelsFrom(form.models).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </>}
        </div>}
        {supportsSpeech && <div className="space-y-2">
          <label htmlFor="speech-model-ids" className="block text-sm font-semibold">Speech model IDs</label>
          <textarea id="speech-model-ids" value={form.speechModels} onChange={(e) => setForm((old) => ({ ...old, speechModels: e.target.value }))} rows={3} maxLength={22000} placeholder="speech-model" disabled={saving} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-mono text-sm" />
        </div>}
        <p className="text-xs opacity-70">Discover model IDs or enter them manually, one per line. A connection can be used for both capabilities when the relevant models are saved.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!ready || saving || !knownType} className="rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white">{saving ? "Saving…" : editingId ? "Save connection changes" : "Save connection"}</button>
        <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }} className="rounded-full border-2 border-[var(--border)] px-5 py-3 font-bold">Cancel</button>
      </div>
    </form>
  </div> : null;

  return <main className="mx-auto w-full max-w-3xl space-y-6 px-1 pb-10">
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.15em] opacity-70">Personal Assistant</p>
      <h1 className="text-3xl font-extrabold">AI &amp; Voice Settings</h1>
      <p className="max-w-2xl leading-relaxed opacity-80">Choose saved connections for reasoning and speech. A single connection can serve both if its protocol and saved models support both. API keys remain encrypted on the server.</p>
    </header>
    {(error || status) && <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      {error && <p role="alert" className="text-sm">{error}</p>}
      {status && <p role="status" className="text-sm">{status}</p>}
    </div>}

    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div><h2 className="text-xl font-bold">Reasoning</h2><p className="text-sm opacity-75">Used for Copilot, planning, reviews and task proposals. Only enabled connections with reasoning models appear here.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Reasoning connection" value={reasoning?.id ?? ""} disabled={!ready || loadingProfiles} onChange={(e) => {
          const item = reasoningOptions.find((p) => p.id === e.target.value);
          updatePreferences({
            reasoningConnectionId: item?.id ?? "",
            reasoningModel: item?.id === preferences.reasoningConnectionId && item.models.includes(preferences.reasoningModel)
              ? preferences.reasoningModel : item?.selectedModel && item.models.includes(item.selectedModel)
                ? item.selectedModel : item?.models[0] ?? "",
          });
        }} className="min-w-0 flex-1 rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3">
          <option value="">Choose a saved reasoning connection</option>
          {reasoningOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" onClick={() => addConnection("reasoning")} className="rounded-full border-2 border-[var(--border)] px-4 py-3 text-sm font-bold">+ Add provider</button>
      </div>
      {reasoning && <div className="space-y-2 rounded-xl bg-[var(--background)] p-3">
        <label className="block text-sm font-semibold">Reasoning model</label>
        <select value={reasoning.models.includes(preferences.reasoningModel) ? preferences.reasoningModel : reasoning.models[0]} onChange={(e) => updatePreferences({ reasoningModel: e.target.value })} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          {reasoning.models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {reasoning.providerType !== "google_generative_language" && <p className="text-xs opacity-70">Streaming Voice Mode currently requires a Google Generative Language connection.</p>}
      </div>}
      {!reasoning && !loadingProfiles && <p className="rounded-xl bg-[var(--background)] p-3 text-sm opacity-75">No reasoning connection selected. Add a connection and save at least one reasoning model ID.</p>}
      {formOpen && placement === "reasoning" && formPanel}
    </section>

    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div><h2 className="text-xl font-bold">Speech</h2><p className="text-sm opacity-75">Only enabled connections with saved text-to-speech models appear. Browser speech remains a playback fallback, not a provider choice.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Speech connection" value={speech?.id ?? ""} disabled={!ready || loadingProfiles} onChange={(e) => {
          const item = speechOptions.find((p) => p.id === e.target.value);
          updatePreferences({
            speechConnectionId: item?.id ?? "",
            speechModel: item?.speechModels.includes(preferences.speechModel) ? preferences.speechModel : item?.speechModels[0] ?? "",
            speechVoiceId: "",
          });
        }} className="min-w-0 flex-1 rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3">
          <option value="">Choose a saved speech connection</option>
          {speechOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" onClick={() => addConnection("speech")} className="rounded-full border-2 border-[var(--border)] px-4 py-3 text-sm font-bold">+ Add provider</button>
      </div>
      {speech && <div className="space-y-3 rounded-xl bg-[var(--background)] p-3">
        <label className="block text-sm font-semibold">Speech model</label>
        <select value={speech.speechModels.includes(preferences.speechModel) ? preferences.speechModel : speech.speechModels[0]} onChange={(e) => updatePreferences({ speechModel: e.target.value })} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          {speech.speechModels.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="block text-sm font-semibold">Voice</label>
        <select value={voices.some((v) => v.id === preferences.speechVoiceId) ? preferences.speechVoiceId : voices[0]?.id ?? ""} disabled={!ready || loadingVoices || !voices.length} onChange={(e) => updatePreferences({ speechVoiceId: e.target.value })} className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <option value="">Choose a voice</option>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.category ? " — " + v.category : ""}</option>)}
        </select>
        {loadingVoices && <p role="status" className="text-sm opacity-75">Loading voices…</p>}
        {!loadingVoices && voiceError && <p role="status" className="text-sm opacity-75">{voiceError}</p>}
      </div>}
      {!speech && !loadingProfiles && <p className="rounded-xl bg-[var(--background)] p-3 text-sm opacity-75">No speech connection selected. Add a connection and save at least one speech model ID.</p>}
      {formOpen && placement === "speech" && formPanel}
    </section>

    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div><h2 className="text-xl font-bold">Saved connections</h2><p className="text-sm opacity-75">Saved profiles are collapsed by default. Use the three-dot menu to edit or delete a connection.</p></div>
      {loadingProfiles && <p role="status" className="text-sm opacity-75">Loading saved connections…</p>}
      {profiles.length === 0 && !loadingProfiles && !error && <p className="text-sm opacity-75">No saved connections yet. Check the connection migrations and server-side AI_PROVIDER_ENCRYPTION_KEY before saving.</p>}
      <div className="space-y-3">
        {profiles.map((p) => <div key={p.id} className="flex items-start gap-2 rounded-xl border border-[var(--border)] p-3">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer rounded-lg py-1">
              <span className="font-semibold">{p.name}</span>
              <span className="ml-2 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs">{p.enabled ? "Enabled" : "Disabled"}</span>
              <span className="mt-1 block break-all text-xs opacity-70">
                {AI_PROVIDER_TYPE_OPTIONS.find((t) => t.id === p.providerType)?.label} · {p.baseUrl}
              </span>
            </summary>
            <div className="space-y-3 border-t border-[var(--border)] pt-3">
              <p className="text-sm opacity-75">{p.models.length} reasoning model(s) · {p.speechModels.length} speech model(s) · {p.hasApiKey ? "Credential saved" : "Credential missing"}</p>
              {p.selectedModel && <p className="break-all text-xs opacity-70">Preferred model: {p.selectedModel}</p>}
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={p.enabled} onChange={(e) => void setEnabled(p, e.target.checked)} className="h-4 w-4" />
                Enable connection
              </label>
            </div>
          </details>
          <details className="relative shrink-0">
            <summary aria-label={"Actions for " + p.name} title="Connection actions" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] text-xl font-bold">⋮</summary>
            <div className="absolute right-0 z-10 mt-1 min-w-32 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              <button type="button" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); editConnection(p); }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold">Edit</button>
              <button type="button" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); void deleteConnection(p); }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700">Delete</button>
            </div>
          </details>
        </div>)}
      </div>
    </section>

    <p className="text-xs opacity-70">Connection selections are stored in this browser only. API keys are never stored in browser preferences or returned by profile APIs. Browser speech is used if generated speech is unavailable.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={saveSettings} disabled={!ready} className="rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white">Save settings and return</button>
      <button type="button" onClick={() => router.back()} className="rounded-full border-2 border-[var(--border)] px-5 py-3 font-bold">Cancel</button>
    </div>
  </main>;
}
