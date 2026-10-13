export type GeminiRetryLogger = (label: string, details: string) => void;

export interface GeminiRetryOptions {
  isDailyPlan: boolean;
  mode: string;
  model: string;
  logDiagnostic: GeminiRetryLogger;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

export async function fetchGeminiWithRetries(
  fetchAttempt: () => Promise<Response>,
  options: GeminiRetryOptions,
): Promise<Response> {
  const sleep = options.sleep ?? (
    (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  );
  const random = options.random ?? Math.random;

  for (let attempt = 0; ; attempt += 1) {
    const upstream = await fetchAttempt();

    if (!options.isDailyPlan || upstream.status !== 503 || attempt >= 2) {
      return upstream;
    }

    const backoffMs =
      500 * (2 ** attempt) + Math.floor(random() * 250);

    options.logDiagnostic("[assistant Gemini retry]", JSON.stringify({
      mode: options.mode,
      model: options.model,
      httpStatus: upstream.status,
      retry: attempt + 1,
      delayMs: backoffMs,
    }));

    if (upstream.body) {
      await upstream.body.cancel().catch(() => undefined);
    }

    await sleep(backoffMs);
  }
}
