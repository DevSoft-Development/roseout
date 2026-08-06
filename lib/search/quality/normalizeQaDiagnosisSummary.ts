export type QaDiagnosis = {
  classification?: string | null;
  terminalOutcome?: string | null;
  requestFulfilled?: boolean | null;
  partialResults?: boolean | null;
  renderMode?: string | null;
  inventoryIssue?: boolean | null;
  evidenceIssue?: boolean | null;
  pairingIssue?: boolean | null;
  reason?: string | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function normalizeQaDiagnosisSummary(args: {
  diagnosis?: QaDiagnosis | null;
  result: any;
}) {
  const diagnosis = args.diagnosis ?? null;
  const result = args.result ?? {};
  const diagnosed = text(diagnosis?.classification) !== null && diagnosis?.classification !== "none";

  const outcome = diagnosed
    ? text(diagnosis?.terminalOutcome) ?? text(result?.outcome ?? result?.searchV2?.outcome ?? result?.debug?.outcome)
    : text(result?.outcome ?? result?.searchV2?.outcome ?? result?.debug?.outcome);

  const renderMode = diagnosed
    ? text(diagnosis?.renderMode) ?? text(result?.render_mode ?? result?.renderMode ?? result?.primaryResultType)
    : text(result?.render_mode ?? result?.renderMode ?? result?.primaryResultType);

  const requestFulfilled = diagnosed && typeof diagnosis?.requestFulfilled === "boolean"
    ? diagnosis.requestFulfilled
    : Boolean(result?.requestFulfilled ?? result?.searchV2?.requestFulfilled ?? result?.success);

  const partialResults = diagnosed && typeof diagnosis?.partialResults === "boolean"
    ? diagnosis.partialResults
    : Boolean(result?.partialResults ?? result?.searchV2?.partialResults);

  return {
    diagnosis,
    diagnosisClassification: text(diagnosis?.classification),
    outcome,
    requestFulfilled,
    partialResults,
    renderMode,
    primaryResultType: renderMode,
  };
}
