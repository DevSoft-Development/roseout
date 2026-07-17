export type MlRecalculationRunStatus =
  | "completed"
  | "completed_no_rows"
  | "failed";

export type MlRecalculationSourceCounts = Record<string, number | null | undefined>;

export type MlRecalculationRunSummary = {
  status: MlRecalculationRunStatus;
  job: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sourceCounts: Record<string, number>;
  candidateRows: number;
  upsertedRows: number;
  skippedReasons: Record<string, number>;
  recommendation: string | null;
  error: {
    message: string;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
};

function normalizeCount(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

function normalizeCounts(values: MlRecalculationSourceCounts) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, normalizeCount(value)]),
  );
}

function totalCounts(values: Record<string, number>) {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

export function buildMlRecalculationRunSummary(input: {
  job: string;
  startedAt: string | Date;
  completedAt?: string | Date;
  sourceCounts?: MlRecalculationSourceCounts;
  candidateRows?: number | null;
  upsertedRows?: number | null;
  skippedReasons?: Record<string, number> | null;
  recommendation?: string | null;
  error?: {
    message?: string | null;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
}): MlRecalculationRunSummary {
  const startedAt = new Date(input.startedAt);
  const completedAt = input.completedAt
    ? new Date(input.completedAt)
    : new Date();
  const sourceCounts = normalizeCounts(input.sourceCounts ?? {});
  const candidateRows = normalizeCount(input.candidateRows);
  const upsertedRows = normalizeCount(input.upsertedRows);
  const errorMessage = input.error?.message?.trim();
  const hasSources = totalCounts(sourceCounts) > 0;

  let status: MlRecalculationRunStatus = "completed";
  if (errorMessage) status = "failed";
  else if (upsertedRows === 0) status = "completed_no_rows";

  let recommendation = input.recommendation?.trim() || null;
  if (!recommendation && status === "failed") {
    recommendation =
      "Inspect the database error and preserve the failed run record before retrying.";
  } else if (!recommendation && !hasSources) {
    recommendation =
      "No eligible source rows were read. Verify the lookback window, event logging, and production table names.";
  } else if (!recommendation && candidateRows === 0) {
    recommendation =
      "Source rows were read, but none produced valid ML candidates. Inspect skipped reasons and identifier extraction.";
  } else if (!recommendation && upsertedRows === 0) {
    recommendation =
      "ML candidates were produced, but no feature rows were written. Inspect conflict targets, permissions, and upsert errors.";
  }

  return {
    status,
    job: input.job,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    sourceCounts,
    candidateRows,
    upsertedRows,
    skippedReasons: input.skippedReasons ?? {},
    recommendation,
    error: errorMessage
      ? {
          message: errorMessage,
          code: input.error?.code ?? null,
          details: input.error?.details ?? null,
          hint: input.error?.hint ?? null,
        }
      : null,
  };
}
