"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addCalendarTask, type CalendarTask } from "@/lib/calendarItemStorage";
import { getVoiceRequestMode } from "@/lib/assistantVoiceIntent";
import { SpeechAudioCache } from "@/lib/speechAudioCache";
import AssistantMarkdown from "@/lib/assistantMarkdown";
import {
  DEFAULT_AI_PREFERENCES,
  loadAIPreferences,
  type AIPreferences,
} from "@/lib/assistantPreferences";

type Message = { role: "user" | "assistant"; content: string; spokenSummary?: string; streaming?: boolean };
type RequestMode = "chat" | "task-proposal" | "voice-chat";
type TaskProposal = {
  title: string;
  dueDate: string;
  priority: CalendarTask["priority"];
};

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;
type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionErrorLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function parseTaskProposal(value: unknown): TaskProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    !record.title.trim() ||
    typeof record.dueDate !== "string" ||
    !["low", "medium", "high"].includes(String(record.priority))
  ) {
    return null;
  }

  return {
    title: record.title.trim().slice(0, 120),
    dueDate: record.dueDate,
    priority: record.priority as CalendarTask["priority"],
  };
}

const SUGGESTIONS = [
  "Summarize my week",
  "What should I focus on next?",
  "Review my study progress",
  "Summarize my active projects",
  "How is my reading progressing?",
];

function logDiagnostic(label: string, details: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info(label, details);
  }
}

async function makeSpeechCacheKey(
  provider: string,
  voice: string,
  content: string,
): Promise<string | null> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest !== "function") {
      return null;
    }

    const encoded = new TextEncoder().encode(
      `${provider}\u0000${voice}\u0000${content}`,
    );
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    const hash = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    return `${provider}:${hash}`;
  } catch {
    // Caching is optional; speech playback must still work without Web Crypto.
    return null;
  }
}

export default function AssistantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [aiPreferences, setAIPreferences] = useState<AIPreferences>(DEFAULT_AI_PREFERENCES);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const [taskProposal, setTaskProposal] = useState<TaskProposal | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const proposalSaveLock = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const [showJumpToInput, setShowJumpToInput] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const pcmReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechAudioCacheRef = useRef<SpeechAudioCache | null>(null);
  const speechRequestRef = useRef(0);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const voiceTurnStartedAtRef = useRef<number | null>(null);
  const voiceRequestStartedAtRef = useRef<number | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechPreparing, setSpeechPreparing] = useState(false);

  if (speechAudioCacheRef.current === null) {
    speechAudioCacheRef.current = new SpeechAudioCache();
  }

  useEffect(() => {
    setAIPreferences(loadAIPreferences());
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const input = questionInputRef.current;
    if (!input) return;

    const observer = new IntersectionObserver(([entry]) => {
      setShowJumpToInput(!entry.isIntersecting);
    });

    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audioSources = audioSourcesRef.current;
    return () => {
      voiceModeRef.current = false;
      voiceTranscriptRef.current = "";
      recognitionRef.current?.abort();
      void pcmReaderRef.current?.cancel().catch(() => {});
      pcmReaderRef.current = null;
      for (const source of audioSources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // It may already have stopped.
        }
      }
      audioSources.clear();
      speechAudioCacheRef.current?.clear();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      void audioContextRef.current?.close().catch(() => {});
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function clearGeneratedAudio(expected?: HTMLAudioElement) {
    if (expected && audioRef.current !== expected) return;

    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  function stopSpeaking() {
    speechRequestRef.current += 1;
    clearGeneratedAudio();

    const reader = pcmReaderRef.current;
    pcmReaderRef.current = null;
    if (reader) void reader.cancel().catch(() => {});

    for (const source of audioSourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // It may already have stopped.
      }
    }
    audioSourcesRef.current.clear();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageIndex(null);
    setSpeechPreparing(false);
  }

  function primeAudioContext(): AudioContext | null {
    if (typeof window === "undefined" || typeof window.AudioContext !== "function") {
      return null;
    }

    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }

      const context = audioContextRef.current;
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }
      return context;
    } catch {
      return null;
    }
  }

  async function speakMessage(content: string, index: number) {
    stopSpeaking();
    const requestId = speechRequestRef.current;
    const speechRequestStartedAt = performance.now();
    const voiceStartedAt = voiceTurnStartedAtRef.current;
    let fallbackStarted = false;

    // Prime playback while this function is still in the user's click/session
    // activation path whenever possible.
    primeAudioContext();
    setVoiceError("");
    setSpeakingMessageIndex(index);
    setSpeechPreparing(true);

    const playBrowserVoice = (message: string) => {
      if (requestId !== speechRequestRef.current || fallbackStarted) return;
      fallbackStarted = true;
      setSpeechPreparing(false);
      setVoiceError(message);
      setSpeakingMessageIndex(index);

      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        setVoiceError(
          message + " Browser read-aloud is also unavailable; you can still read the response on screen.",
        );
        setSpeakingMessageIndex(null);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = "en-GB";
      utterance.onstart = () => {
        if (requestId === speechRequestRef.current) {
          setSpeakingMessageIndex(index);
        }
      };
      utterance.onend = () => {
        if (requestId === speechRequestRef.current) {
          setSpeakingMessageIndex(null);
        }
      };
      utterance.onerror = (event) => {
        if (requestId !== speechRequestRef.current) return;
        setSpeakingMessageIndex(null);
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setVoiceError(
            "Audio playback failed. You can still read the response on screen.",
          );
        }
      };

      window.speechSynthesis.speak(utterance);
    };

    async function playCachedPcmAudio(
      bytes: Uint8Array,
      sampleRate: number,
    ): Promise<boolean> {
      const context = primeAudioContext();
      if (!context || bytes.byteLength < 2) return false;

      try {
        await context.resume();
      } catch {
        return false;
      }

      if (requestId !== speechRequestRef.current) return false;

      const usableBytes = bytes.byteLength - (bytes.byteLength % 2);
      if (usableBytes === 0) return false;

      try {
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          usableBytes,
        );
        const samples = new Float32Array(usableBytes / 2);

        for (let sample = 0; sample < samples.length; sample += 1) {
          samples[sample] = view.getInt16(sample * 2, true) / 32768;
        }

        const audioBuffer = context.createBuffer(
          1,
          samples.length,
          sampleRate,
        );
        audioBuffer.copyToChannel(samples, 0);

        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);

        source.onended = () => {
          audioSourcesRef.current.delete(source);
          try {
            source.disconnect();
          } catch {
            // Ignore an already disconnected source.
          }

          if (requestId === speechRequestRef.current) {
            setSpeechPreparing(false);
            setSpeakingMessageIndex(null);
            voiceTurnStartedAtRef.current = null;
            voiceRequestStartedAtRef.current = null;
          }
        };

        audioSourcesRef.current.add(source);

        try {
          source.start(context.currentTime + 0.02);
        } catch {
          audioSourcesRef.current.delete(source);
          source.onended = null;
          try {
            source.disconnect();
          } catch {
            // Ignore cleanup errors.
          }
          return false;
        }

        setSpeechPreparing(false);
        setSpeakingMessageIndex(index);
        logDiagnostic("[voice timing]", JSON.stringify({
          stage: "cached_audio_replay",
          provider: aiPreferences.speechConnectionId,
        }));
        return true;
      } catch {
        return false;
      }
    }

    if (!aiPreferences.speechConnectionId || !aiPreferences.speechModel) {
      playBrowserVoice(
        "Choose an enabled speech connection in AI & Voice Settings for generated speech. Using your browser's voice for now.",
      );
      return;
    }
    const selectedSpeechVoice = aiPreferences.speechVoiceId;

    const cacheKey = await makeSpeechCacheKey(
      aiPreferences.speechConnectionId + ":" + aiPreferences.speechModel,
      selectedSpeechVoice,
      content,
    );

    if (requestId !== speechRequestRef.current) return;

    if (cacheKey) {
      const cached = speechAudioCacheRef.current?.get(cacheKey);

      if (cached) {
        if (await playCachedPcmAudio(cached.bytes, cached.sampleRate)) {
          return;
        }

        if (requestId !== speechRequestRef.current) return;

        // Don't spend another TTS request if cached audio cannot be played.
        speechAudioCacheRef.current?.delete(cacheKey);
        playBrowserVoice(
          "Cached natural voice could not be played; using your browser's voice instead.",
        );
        return;
      }
    }

    async function playPcmStream(
      response: Response,
      cacheKey: string | null,
    ): Promise<boolean> {
      const context = primeAudioContext();
      if (!context || !response.body) return false;
      const audioContext: AudioContext = context;

      try {
        await audioContext.resume();
      } catch {
        return false;
      }

      const reader = response.body.getReader();
      pcmReaderRef.current = reader;

      const sampleRateHeader = Number(response.headers.get("X-Audio-Sample-Rate"));
      const sampleRate =
        Number.isFinite(sampleRateHeader) && sampleRateHeader > 0
          ? sampleRateHeader
          : 24000;

      let carry = new Uint8Array(0);
      let nextStartTime = audioContext.currentTime + 0.035;
      let activeSources = 0;
      let streamEnded = false;
      let receivedAudio = false;
      let firstAudioChunkLogged = false;
      let cacheableAudio = cacheKey !== null;
      let cachedByteLength = 0;
      const cachedChunks: Uint8Array[] = [];
      const requestSources = new Set<AudioBufferSourceNode>();

      function stopRequestSources() {
        for (const source of requestSources) {
          source.onended = null;
          audioSourcesRef.current.delete(source);
          try {
            source.stop();
          } catch {
            // It may already have stopped.
          }
        }
        requestSources.clear();
        activeSources = 0;
      }

      function finishIfDone() {
        if (
          !streamEnded ||
          activeSources !== 0 ||
          requestId !== speechRequestRef.current
        ) {
          return;
        }

        setSpeechPreparing(false);
        setSpeakingMessageIndex(null);
        voiceTurnStartedAtRef.current = null;
        voiceRequestStartedAtRef.current = null;
      }

      function queuePcm(incoming: Uint8Array) {
        const joined = new Uint8Array(carry.length + incoming.length);
        joined.set(carry);
        joined.set(incoming, carry.length);

        // PCM16 uses two bytes per sample; preserve a split sample for
        // the next transport chunk.
        const usableBytes = joined.length - (joined.length % 2);
        carry = joined.slice(usableBytes);
        if (usableBytes === 0) return;

        const view = new DataView(
          joined.buffer,
          joined.byteOffset,
          usableBytes,
        );
        const samples = new Float32Array(usableBytes / 2);

        for (let sample = 0; sample < samples.length; sample += 1) {
          samples[sample] = view.getInt16(sample * 2, true) / 32768;
        }

        const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
        audioBuffer.copyToChannel(samples, 0);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        const startAt = Math.max(audioContext.currentTime + 0.02, nextStartTime);
        nextStartTime = startAt + audioBuffer.duration;

        activeSources += 1;
        receivedAudio = true;
        requestSources.add(source);
        audioSourcesRef.current.add(source);
        setSpeechPreparing(false);
        setSpeakingMessageIndex(index);

        source.onended = () => {
          requestSources.delete(source);
          audioSourcesRef.current.delete(source);
          try {
            source.disconnect();
          } catch {
            // Ignore a source already disconnected by the browser.
          }
          activeSources -= 1;
          finishIfDone();
        };

        source.start(startAt);

        if (!firstAudioChunkLogged) {
          firstAudioChunkLogged = true;
          const now = performance.now();
          logDiagnostic("[voice timing]", JSON.stringify({
            stage: "first_audio_chunk_scheduled",
            ttsToFirstChunkMs: Math.round(now - speechRequestStartedAt),
            totalSinceMicrophoneStartMs: voiceStartedAt === null
              ? null
              : Math.round(now - voiceStartedAt),
          }));
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (requestId !== speechRequestRef.current) {
            await reader.cancel().catch(() => {});
            stopRequestSources();
            return true;
          }

          if (done) break;

          if (cacheableAudio) {
            const cacheLimit =
              speechAudioCacheRef.current?.maxEntryBytes ?? 0;

            if (cachedByteLength + value.byteLength <= cacheLimit) {
              cachedChunks.push(value.slice());
              cachedByteLength += value.byteLength;
            } else {
              // Stop accumulating immediately if the entry could exceed its limit.
              cacheableAudio = false;
              cachedChunks.length = 0;
              cachedByteLength = 0;
            }
          }

          queuePcm(value);
        }

        // A trailing single byte cannot make a complete PCM16 sample.
        carry = new Uint8Array(0);
        streamEnded = true;
        finishIfDone();

        if (!receivedAudio) {
          stopRequestSources();
          return false;
        }

        // Cache only after the stream ended cleanly and this request is still active.
        if (
          cacheKey &&
          cacheableAudio &&
          cachedByteLength > 0 &&
          requestId === speechRequestRef.current
        ) {
          const completeAudio = new Uint8Array(cachedByteLength);
          let offset = 0;

          for (const chunk of cachedChunks) {
            completeAudio.set(chunk, offset);
            offset += chunk.byteLength;
          }

          speechAudioCacheRef.current?.set(
            cacheKey,
            completeAudio,
            sampleRate,
          );
        }

        return true;
      } catch {
        stopRequestSources();
        return false;
      } finally {
        if (pcmReaderRef.current === reader) pcmReaderRef.current = null;
        try {
          reader.releaseLock();
        } catch {
          // The reader may already be released.
        }
      }
    }

    try {
      const response = await fetch("/api/assistant/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          providerProfileId: aiPreferences.speechConnectionId,
          model: aiPreferences.speechModel,
          voice: aiPreferences.speechVoiceId,
          voiceId: aiPreferences.speechVoiceId,
        }),
      });

      if (!response.ok) {
        let errorMessage = `Natural voice request failed (HTTP ${response.status}).`;
        const errorPayload: unknown = await response.json().catch(() => null);

        if (
          errorPayload &&
          typeof errorPayload === "object" &&
          !Array.isArray(errorPayload) &&
          "error" in errorPayload &&
          typeof errorPayload.error === "string"
        ) {
          errorMessage = errorPayload.error;
        }

        throw new Error(errorMessage);
      }
      if (requestId !== speechRequestRef.current) return;

      logDiagnostic("[voice timing]", JSON.stringify({
        stage: "tts_stream_open",
        ttsHeadersMs: Math.round(performance.now() - speechRequestStartedAt),
        totalSinceMicrophoneStartMs: voiceStartedAt === null
          ? null
          : Math.round(performance.now() - voiceStartedAt),
      }));

      const played = await playPcmStream(response, cacheKey);
      if (!played && requestId === speechRequestRef.current) {
        playBrowserVoice(
          "Natural voice is unavailable right now; using your browser's voice instead.",
        );
      }
    } catch (error) {
      if (requestId === speechRequestRef.current) {
        const reason = error instanceof Error
          ? error.message
          : "Unknown speech service error.";

        playBrowserVoice(
          `${reason} Using your browser's voice instead.`,
        );
      }
    }
  }

  function toggleVoiceMode() {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    setVoiceError("");

    if (next) primeAudioContext();

    if (!next) {
      voiceTranscriptRef.current = "";
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.abort();
      setListening(false);
      stopSpeaking();
    }
  }

  function toggleVoiceInput() {
    setVoiceError("");

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    if (typeof window === "undefined") return;

    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceError("Voice input is not supported in this browser. Try a supported browser or type your message instead.");
      return;
    }

    stopSpeaking();
    primeAudioContext();

    try {
      const recognition = new Recognition();
      recognition.lang = "en-GB";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      voiceTranscriptRef.current = "";

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();

        if (!transcript) return;

        voiceTranscriptRef.current = transcript;
        setDraft((current) => {
          if (voiceModeRef.current) return transcript;
          const existing = current.trim();
          return existing ? existing + " " + transcript : transcript;
        });
        setVoiceError("");

        if (voiceModeRef.current) {
          try {
            recognition.stop();
          } catch {
            // The recognition session may already be ending.
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setVoiceError("Microphone access was denied. Allow microphone access in your browser, or type your message instead.");
        } else if (event.error === "no-speech") {
          setVoiceError("No speech was detected. Try again or type your message.");
        } else if (event.error === "language-not-supported") {
          setVoiceError("English (UK) voice recognition is unavailable in this browser. Try another supported browser or type your message.");
        } else if (event.error !== "aborted") {
          setVoiceError("Voice input failed. Please try again or type your message.");
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }

        setListening(false);

        const transcript = voiceTranscriptRef.current.trim();
        voiceTranscriptRef.current = "";

        if (voiceModeRef.current && transcript) {
          const now = performance.now();
          const voiceStartedAt = voiceTurnStartedAtRef.current;

          logDiagnostic("[voice timing]", JSON.stringify({
            stage: "recognition_complete",
            recognitionMs: voiceStartedAt === null
              ? null
              : Math.round(now - voiceStartedAt),
            transcriptCharacters: transcript.length,
          }));

          voiceRequestStartedAtRef.current = now;
          const detectedMode = getVoiceRequestMode(transcript);
          void sendQuestion(
            transcript,
            detectedMode === "task-proposal" ? "task-proposal" : "voice-chat",
          );
        } else if (!transcript) {
          voiceTurnStartedAtRef.current = null;
          voiceRequestStartedAtRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      voiceTurnStartedAtRef.current = voiceModeRef.current
        ? performance.now()
        : null;
      voiceRequestStartedAtRef.current = null;
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError("Couldn't start voice input. Check browser microphone permissions, or type your message.");
    }
  }

  async function sendQuestion(
    question: string,
    mode: RequestMode = "chat",
  ) {
    if (!question.trim() || sendingRef.current) return;
    const voiceRequestStartedAt = voiceRequestStartedAtRef.current;
    sendingRef.current = true;

    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((old) => [...old, { role: "user", content: question }]);
    setDraft("");
    setError("");
    if (mode === "task-proposal") setProposalError("");
    setSending(true);

    try {
      const requestPayload = {
        question,
        history,
        mode,
        streamText: mode === "chat",
        provider: "custom",
        providerProfileId: aiPreferences.reasoningConnectionId,
        model: aiPreferences.reasoningModel,
      };

      let response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      // Preserve normal chat for providers that do not support streaming.
      if (mode === "chat" && response.status === 409) {
        const rejectedPayload: unknown = await response.clone().json().catch(() => null);

        if (
          rejectedPayload &&
          typeof rejectedPayload === "object" &&
          !Array.isArray(rejectedPayload) &&
          "error" in rejectedPayload &&
          rejectedPayload.error ===
            "Streaming is not available for this provider configuration."
        ) {
          response = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...requestPayload, streamText: false }),
          });
        }
      }

      if (
        mode === "chat" &&
        response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")
      ) {
        if (!response.ok || !response.body) {
          setError("The assistant could not start a streaming response. Please try again.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let partialAnswer = "";
        let streamError = "";
        const completedResponseRef: {
          current: { answer: string; spokenSummary: string } | null;
        } = { current: null };

        function publishStreamedMessage(
          content: string,
          complete: boolean,
          spokenSummary?: string,
        ) {
          setMessages((old) => {
            const lastIndex = old.length - 1;
            const last = old[lastIndex];

            const message: Message = {
              role: "assistant",
              content,
              ...(complete
                ? (spokenSummary ? { spokenSummary } : {})
                : { streaming: true }),
            };

            if (last?.role === "assistant" && last.streaming) {
              return [...old.slice(0, lastIndex), message];
            }

            return [...old, message];
          });
        }

        function processTextEvent(eventText: string) {
          const data = eventText
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (!data) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            return;
          }

          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return;
          }

          const event = parsed as Record<string, unknown>;

          if (event.type === "delta" && typeof event.text === "string") {
            partialAnswer += event.text;
            publishStreamedMessage(partialAnswer, false);
            return;
          }

          if (
            event.type === "complete" &&
            typeof event.answer === "string" &&
            typeof event.spokenSummary === "string"
          ) {
            completedResponseRef.current = {
              answer: event.answer,
              spokenSummary: event.spokenSummary,
            };
            return;
          }

          if (event.type === "error" && typeof event.error === "string") {
            streamError = event.error;
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            pending += decoder.decode(value, { stream: true });
            const events = pending.split(/\r?\n\r?\n/);
            pending = events.pop() ?? "";

            for (const event of events) processTextEvent(event);
          }

          pending += decoder.decode();
          if (pending.trim()) processTextEvent(pending);
        } catch {
          streamError = "The response stream was interrupted. Please try again.";
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Ignore an already released reader.
          }
        }

        const completedResponse = completedResponseRef.current;

        if (streamError) {
          if (partialAnswer) publishStreamedMessage(partialAnswer, true);
          setError(streamError);
          return;
        }

        if (!completedResponse) {
          if (partialAnswer) publishStreamedMessage(partialAnswer, true);
          setError("The assistant response stream ended unexpectedly. Please try again.");
          return;
        }

        publishStreamedMessage(
          completedResponse.answer,
          true,
          completedResponse.spokenSummary,
        );

        if (voiceModeRef.current) {
          void speakMessage(completedResponse.spokenSummary, messages.length + 1);
        }
        return;
      }

      if (mode === "voice-chat") {
        if (!response.ok) {
          const failedPayload: unknown = await response.json().catch(() => null);
          const failedResult = failedPayload && typeof failedPayload === "object"
            ? failedPayload as Record<string, unknown>
            : {};
          setError(typeof failedResult.error === "string"
            ? failedResult.error
            : "The assistant couldn't answer. Please try again.");
          return;
        }

        if (!response.body) {
          setError("The assistant returned no voice stream. Please try again.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        const completedResponseRef: { current: { answer: string; spokenSummary: string } | null } = { current: null };
        let streamError = "";
        let summarySpeechStarted = false;

        const processEvent = (eventText: string) => {
          const data = eventText
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (!data) return;

          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            return;
          }

          if (!event || typeof event !== "object" || Array.isArray(event)) return;
          const record = event as Record<string, unknown>;

          if (record.type === "summary" && typeof record.text === "string") {
            if (voiceModeRef.current && !summarySpeechStarted) {
              summarySpeechStarted = true;
              if (voiceRequestStartedAt !== null) {
                logDiagnostic("[voice timing]", JSON.stringify({
                  stage: "spoken_summary_received",
                  summaryReadyMs: Math.round(performance.now() - voiceRequestStartedAt),
                }));
              }
              void speakMessage(record.text, messages.length + 1);
            }
            return;
          }

          if (
            record.type === "complete" &&
            typeof record.answer === "string" &&
            typeof record.spokenSummary === "string"
          ) {
            completedResponseRef.current = {
              answer: record.answer,
              spokenSummary: record.spokenSummary,
            };
            return;
          }

          if (record.type === "error" && typeof record.error === "string") {
            streamError = record.error;
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            pending += decoder.decode(value, { stream: true });
            const events = pending.split(/\r?\n\r?\n/);
            pending = events.pop() ?? "";
            for (const event of events) processEvent(event);
          }

          pending += decoder.decode();
          if (pending.trim()) processEvent(pending);
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // The reader may already have been released.
          }
        }

        if (streamError) {
          setError(streamError);
          return;
        }

        const completedResponse = completedResponseRef.current;
        if (!completedResponse) {
          setError("The assistant response stream ended unexpectedly. Please try again.");
          return;
        }

        setMessages((old) => [
          ...old,
          {
            role: "assistant",
            content: completedResponse.answer,
            spokenSummary: completedResponse.spokenSummary,
          },
        ]);

        if (voiceModeRef.current && !summarySpeechStarted) {
          void speakMessage(completedResponse.spokenSummary, messages.length + 1);
        }

        if (voiceRequestStartedAt !== null) {
          logDiagnostic("[voice timing]", JSON.stringify({
            stage: "full_answer_received",
            totalResponseMs: Math.round(performance.now() - voiceRequestStartedAt),
          }));
        }
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const result = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : {};

      if (voiceRequestStartedAt !== null) {
        const now = performance.now();
        logDiagnostic("[voice timing]", JSON.stringify({
          stage: "assistant_response_received",
          assistantResponseMs: Math.round(now - voiceRequestStartedAt),
          totalSinceMicrophoneStartMs: voiceTurnStartedAtRef.current === null
            ? null
            : Math.round(now - voiceTurnStartedAtRef.current),
        }));
      }

      if (!response.ok) {
        setError(typeof result.error === "string"
          ? result.error
          : "The assistant couldn't answer. Please try again.");
        return;
      }

      if (mode === "task-proposal") {
        const proposal = parseTaskProposal(result.taskProposal);
        if (!proposal) {
          setError("The assistant returned an invalid task draft. Please try again.");
          return;
        }

        const confirmation = [
          `I've drafted a task for your review: ${proposal.title}.`,
          `Due date: ${proposal.dueDate || "no deadline"}.`,
          `Priority: ${proposal.priority}.`,
          "Nothing has been saved. Review the draft and select Confirm and add task when you're ready.",
        ].join(" ");

        setTaskProposal(proposal);
        setMessages((old) => [
          ...old,
          { role: "assistant", content: confirmation },
        ]);

        if (voiceModeRef.current) {
          void speakMessage(confirmation, messages.length + 1);
        }
        return;
      }

      if (typeof result.answer !== "string") {
        setError("The assistant couldn't answer. Please try again.");
        return;
      }

      const answer = result.answer as string;
      const spokenSummary =
        typeof result.spokenSummary === "string" && result.spokenSummary.trim()
          ? result.spokenSummary.trim()
          : answer;

      setMessages((old) => [
        ...old,
        { role: "assistant", content: answer, spokenSummary },
      ]);

      if (voiceModeRef.current) {
        void speakMessage(spokenSummary, messages.length + 1);
      }
    } catch {
      setError("Couldn't reach the assistant. Check your connection and retry.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (listening) {
      recognitionRef.current?.stop();
      setVoiceError("Stopped listening. Review your dictated text before sending it.");
      return;
    }
    await sendQuestion(draft.trim(), "chat");
  }

  function cancelTaskProposal() {
    if (savingProposal) return;
    setTaskProposal(null);
    setProposalError("");
  }

  function confirmTaskProposal() {
    if (!taskProposal || proposalSaveLock.current) return;

    const title = taskProposal.title.trim();
    if (!title) {
      setProposalError("Enter a task title before saving.");
      return;
    }

    proposalSaveLock.current = true;
    setSavingProposal(true);
    setProposalError("");

    try {
      const created = addCalendarTask({
        title: title.slice(0, 120),
        dueDate: taskProposal.dueDate || undefined,
        priority: taskProposal.priority,
        completed: false,
      });

      setTaskProposal(null);
      router.push(
        `/classes?findCalendarItemId=${encodeURIComponent(created.id)}`,
      );
    } catch {
      setProposalError(
        "The task could not be saved on this device. Your draft is still here; check available storage and try again.",
      );
    } finally {
      proposalSaveLock.current = false;
      setSavingProposal(false);
    }
  }

  return (
    <section className="ai-copilot">
      <header className="ai-copilot__header">
        <div>
          <h1>AI Copilot</h1>
        </div>
      </header>

      <div className="ai-copilot__panel">
        <div className="ai-copilot__transcript" role="log" aria-live="polite">
          {messages.length === 0 ? (
            <div className="ai-copilot__welcome">
              <h2>What would you like to work through?</h2>
              <div className="ai-copilot__suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="ai-copilot__suggestion"
                    onClick={() => setDraft(suggestion)}
                    disabled={sending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`ai-copilot__message ai-copilot__message--${message.role}`}
            >
              <span className="ai-copilot__message-label">
                {message.role === "user" ? "You" : "AI Copilot"}
              </span>
              <AssistantMarkdown content={message.content} />
              {message.role === "assistant" && (
                <div className="ai-copilot__message-actions">
                  <button
                    type="button"
                    className="ai-copilot__message-action"
                    onClick={() => speakMessage(message.spokenSummary || message.content, index)}
                  >
                    {speakingMessageIndex === index
                      ? "Restart audio"
                      : message.spokenSummary
                        ? "Read summary aloud"
                        : "Read aloud"}
                  </button>
                  {speakingMessageIndex === index && (
                    <button
                      type="button"
                      className="ai-copilot__message-action"
                      onClick={stopSpeaking}
                    >
                      Stop reading
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {sending && <p role="status" className="ai-copilot__thinking">Copilot is working on your answer…</p>}
          <div ref={endRef} />
        </div>

        {taskProposal && (
          <section
            className="m-4 space-y-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
            aria-labelledby="task-proposal-heading"
          >
            <div>
              <h2 id="task-proposal-heading" className="text-lg font-extrabold">
                Review proposed task
              </h2>
              <p className="mt-1 text-sm">
                This is only a draft. Nothing is saved until you confirm.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="proposal-title" className="mb-1 block text-sm font-extrabold">
                  Task title
                </label>
                <input
                  id="proposal-title"
                  type="text"
                  maxLength={120}
                  required
                  value={taskProposal.title}
                  onChange={(event) => setTaskProposal((current) =>
                    current ? { ...current, title: event.target.value } : current
                  )}
                  disabled={savingProposal}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                />
              </div>

              <div>
                <label htmlFor="proposal-due-date" className="mb-1 block text-sm font-extrabold">
                  Due date (optional)
                </label>
                <input
                  id="proposal-due-date"
                  type="date"
                  value={taskProposal.dueDate}
                  onChange={(event) => setTaskProposal((current) =>
                    current ? { ...current, dueDate: event.target.value } : current
                  )}
                  disabled={savingProposal}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                />
              </div>

              <div>
                <label htmlFor="proposal-priority" className="mb-1 block text-sm font-extrabold">
                  Priority
                </label>
                <select
                  id="proposal-priority"
                  value={taskProposal.priority}
                  onChange={(event) => setTaskProposal((current) =>
                    current
                      ? { ...current, priority: event.target.value as CalendarTask["priority"] }
                      : current
                  )}
                  disabled={savingProposal}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {proposalError && (
              <p className="text-sm font-bold text-red-700" role="alert">
                {proposalError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmTaskProposal}
                disabled={savingProposal || !taskProposal.title.trim()}
                className="rounded-full bg-[var(--primary)] px-4 py-2 font-extrabold text-white disabled:opacity-50"
              >
                {savingProposal ? "Saving task…" : "Confirm and add task"}
              </button>
              <button
                type="button"
                onClick={cancelTaskProposal}
                disabled={savingProposal}
                className="rounded-full border-2 border-[var(--border)] px-4 py-2 font-extrabold disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {error && <p className="ai-copilot__error" role="alert">{error}</p>}

        <form ref={composerRef} className="ai-copilot__form" onSubmit={submit}>
          <label className="ai-copilot__label" htmlFor="ai-question">Your question</label>
          {voiceError && (
            <p className="ai-copilot__voice-error" role="alert">{voiceError}</p>
          )}
          <textarea
            id="ai-question"
            ref={questionInputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your saved records…"
            maxLength={1200}
            rows={3}
            required
            disabled={sending}
          />
          <div className="ai-copilot__form-footer flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span>{draft.length}/1200 characters</span>
              <span className="ai-copilot__voice-status" aria-live="polite">
                {listening
                  ? "Listening…"
                  : sending
                    ? "Thinking…"
                    : voiceMode
                      ? "Voice Mode on"
                      : speechPreparing
                        ? "Preparing voice…"
                        : speakingMessageIndex !== null
                          ? "Speaking…"
                          : ""}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="ai-copilot__voice-button inline-flex h-11 w-11 items-center justify-center rounded-full"
                onClick={toggleVoiceInput}
                disabled={(sending && !listening) || Boolean(taskProposal)}
                aria-label={listening ? "Stop listening" : "Use microphone"}
                title={listening ? "Stop listening" : "Use microphone"}
                aria-pressed={listening}
              >
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <path d="M12 17v5M8 22h8" />
                </svg>
              </button>

              <details className="relative">
                <summary
                  className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                  aria-label="More Copilot actions"
                  title="More Copilot actions"
                >
                  <svg
                    width="21"
                    height="21"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </summary>

                <div className="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                    aria-pressed={voiceMode}
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      toggleVoiceMode();
                    }}
                  >
                    {voiceMode ? "Turn Voice Mode off" : "Enable Voice Mode"}
                  </button>

                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void sendQuestion(draft.trim(), "task-proposal");
                    }}
                    disabled={sending || listening || !draft.trim() || Boolean(taskProposal)}
                  >
                    Draft task
                  </button>
                </div>
              </details>

              <button
                className="ai-copilot__send"
                type="submit"
                disabled={sending || listening || !draft.trim()}
              >
                {sending ? "Thinking…" : "Ask copilot"}
              </button>
            </div>
          </div>
        </form>

        {showJumpToInput && (
          <button
            type="button"
            className="ai-copilot__jump-to-input"
            aria-label="Jump to bottom of page"
            title="Jump to bottom of page"
            onClick={() =>
              window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: "smooth",
              })
            }
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 4v12" />
              <path d="m6 10 6 6 6-6" />
              <path d="M5 20h14" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
