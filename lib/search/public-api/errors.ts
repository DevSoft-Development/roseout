import { randomUUID } from "crypto";

export class PublicSearchError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
    this.name = "PublicSearchError";
  }
}

export class PublicSearchTimeoutError extends PublicSearchError {
  constructor(
    public stage: string,
    message = `${stage} timed out`,
  ) {
    super("SEARCH_TIMEOUT", message, stage === "overall" ? 504 : 503, true);
    this.name = "PublicSearchTimeoutError";
  }
}

export function isTimeoutError(
  error: unknown,
): error is PublicSearchTimeoutError {
  return error instanceof PublicSearchTimeoutError;
}

export function mapErrorToStatus(error: unknown): number {
  if (error instanceof PublicSearchError) return error.status;
  const message = error instanceof Error ? error.message : String(error);
  if (/supabase|database|db|fetch failed|econnreset|etimedout/i.test(message))
    return 503;
  return 500;
}

const DEFAULTS: Record<string, number> = {
  parse: 1500,
  identity: 2500,
  limit: 2500,
  anchor: 2500,
  intent: 3500,
  database: 12000,
  pairing: 4000,
  search: 25000,
  overall: 30000,
};

const BOUNDS: Record<string, [number, number]> = {
  parse: [100, 5000],
  identity: [250, 10000],
  limit: [250, 10000],
  anchor: [250, 10000],
  intent: [250, 15000],
  database: [1000, 30000],
  pairing: [250, 15000],
  search: [1000, 45000],
  overall: [1000, 60000],
};

export function getDeadlineMs(stage: keyof typeof DEFAULTS): number {
  const raw = process.env[`PUBLIC_SEARCH_${stage.toUpperCase()}_TIMEOUT_MS`];
  const parsed = raw ? Number(raw) : DEFAULTS[stage];
  const [min, max] = BOUNDS[stage];
  return Math.min(
    max,
    Math.max(min, Number.isFinite(parsed) ? parsed : DEFAULTS[stage]),
  );
}

export async function withStageDeadline<T>(
  stage: keyof typeof DEFAULTS,
  work: Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PublicSearchTimeoutError(stage)),
      getDeadlineMs(stage),
    );
  });
  try {
    return await Promise.race([
      work.catch((error) => {
        throw error;
      }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const withDeadline = withStageDeadline;

export function resolveRequestId(headers: Headers): string {
  const incoming =
    headers.get("x-request-id") || headers.get("x-correlation-id");
  if (incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming)) return incoming;
  return randomUUID();
}
