export type SearchTelemetrySnapshot = {
  intentParserSource: string;
  pairCandidatesEvaluated: number | null;
  validPairCountBeforeRender: number | null;
  candidatePairCountBeforeRequiredPairSuppression: number | null;
  pairsRejectedForDistance: number | null;
  pairsRejectedForMissingCoordinates: number | null;
  extremeWalkingRoutesRejected: number | null;
  invalidWalkingRoutesHiddenFromDisplay: number | null;
  distanceMode: string | null;
  maxPairDistanceMiles: number | null;
  maxPairWalkingMinutes: number | null;
  intentMs: number | null;
  searchMs: number | null;
  pairingMs: number | null;
  rankingMs: number | null;
  mlStatus:
    | "applied"
    | "not_needed"
    | "ranking_unchanged"
    | "insufficient_features"
    | "unavailable"
    | "enabled_not_applied"
    | "disabled";
  mlReason: string | null;
};

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : null;
}

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function nonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstObject(...values: unknown[]): Record<string, any> {
  for (const value of values) {
    const object = objectValue(value);
    if (object) return object;
  }
  return {};
}

export function resolveSearchIntentParserSource(args: {
  result?: any;
  debug?: any;
  selectedSearchLane?: string | null;
}): string {
  const debug = args.debug ?? args.result?.debug ?? {};
  const normalizedIntent =
    objectValue(debug?.normalizedIntent) ??
    objectValue(args.result?.normalizedIntent) ??
    {};

  const direct = nonEmptyString(
    debug?.intentParserSource,
    debug?.intent_parser_source,
    debug?.parser_source,
    normalizedIntent?.intentParserSource,
    normalizedIntent?.parserSource,
    args.result?.metadata?.intentParserSource,
    args.result?.metadata?.intent_parser_source,
  );
  if (direct) return direct;

  if (
    normalizedIntent?.inferredFromRenderMode ||
    debug?.render_mode === "mixed_pairs" ||
    debug?.renderMode === "mixed_pairs" ||
    args.result?.render_mode === "mixed_pairs" ||
    args.result?.renderMode === "mixed_pairs"
  ) {
    return "render_inference";
  }

  if (
    args.selectedSearchLane &&
    !["auto", "any", "all", "default"].includes(
      args.selectedSearchLane.toLowerCase(),
    )
  ) {
    return "selected_lane";
  }

  if (objectValue(debug?.normalizedIntent) || objectValue(debug?.intent)) {
    return "enterprise_intent";
  }

  return "enterprise_fallback";
}

function resolveMlStatus(debug: any): Pick<
  SearchTelemetrySnapshot,
  "mlStatus" | "mlReason"
> {
  const ml = firstObject(
    debug?.mlSearchDebug,
    debug?.ml,
    debug?.machineLearning,
  );
  const applied =
    ml?.mlApplied === true ||
    ml?.applied === true ||
    debug?.mlAppliedInPublicPath === true;
  const enabled =
    ml?.mlEnabled === true ||
    ml?.enabled === true ||
    debug?.publicSearchUsesMl === true ||
    debug?.edgeSearchUsesMl === true;

  const reason = nonEmptyString(
    ml?.mlUnavailableReason,
    ml?.unavailableReason,
    ml?.notAppliedReason,
    debug?.mlUnavailableReason,
    debug?.mlNotAppliedReason,
  );

  if (applied) return { mlStatus: "applied", mlReason: null };
  if (!enabled) return { mlStatus: "disabled", mlReason: reason };

  const normalizedReason = String(reason ?? "").toLowerCase();
  if (
    normalizedReason.includes("not materially change") ||
    normalizedReason.includes("unchanged")
  ) {
    return { mlStatus: "ranking_unchanged", mlReason: reason };
  }
  if (
    normalizedReason.includes("insufficient") ||
    normalizedReason.includes("feature")
  ) {
    return { mlStatus: "insufficient_features", mlReason: reason };
  }
  if (
    normalizedReason.includes("unavailable") ||
    normalizedReason.includes("error") ||
    normalizedReason.includes("disabled")
  ) {
    return { mlStatus: "unavailable", mlReason: reason };
  }

  const resultCount = finiteNumber(
    debug?.counts?.finalDisplayedResultCount,
    debug?.finalDisplayedResultCount,
    debug?.resultCount,
  );
  if (resultCount != null && resultCount > 0 && !reason) {
    return { mlStatus: "not_needed", mlReason: null };
  }

  return { mlStatus: "enabled_not_applied", mlReason: reason };
}

export function resolveSearchTelemetry(args: {
  result?: any;
  debug?: any;
  selectedSearchLane?: string | null;
  routeSearchMs?: number | null;
}): SearchTelemetrySnapshot {
  const debug = args.debug ?? args.result?.debug ?? {};
  const counts = firstObject(debug?.counts, args.result?.counts);
  const pairing = firstObject(
    debug?.pairingDebug,
    debug?.pairing,
    debug?.pair_debug,
    debug?.pairDebug,
    counts?.pairingDebug,
  );
  const performance = firstObject(
    debug?.performance,
    debug?.timings,
    args.result?.performance,
  );
  const normalizedIntent = firstObject(
    debug?.normalizedIntent,
    debug?.intent,
    args.result?.normalizedIntent,
  );
  const preference = firstObject(
    normalizedIntent?.pairingPreference,
    debug?.pairingPreference,
    args.result?.pairingPreference,
  );
  const ml = resolveMlStatus(debug);

  return {
    intentParserSource: resolveSearchIntentParserSource({
      result: args.result,
      debug,
      selectedSearchLane: args.selectedSearchLane,
    }),
    pairCandidatesEvaluated: finiteNumber(
      debug?.pairCandidatesEvaluated,
      counts?.pairCandidatesEvaluated,
      pairing?.pairCandidatesEvaluated,
    ),
    validPairCountBeforeRender: finiteNumber(
      debug?.validPairCountBeforeRender,
      counts?.validPairCountBeforeRender,
      pairing?.validPairCountBeforeRender,
    ),
    candidatePairCountBeforeRequiredPairSuppression: finiteNumber(
      debug?.candidatePairCountBeforeRequiredPairSuppression,
      counts?.candidatePairCountBeforeRequiredPairSuppression,
      pairing?.candidatePairCountBeforeRequiredPairSuppression,
    ),
    pairsRejectedForDistance: finiteNumber(
      debug?.pairsRejectedForDistance,
      counts?.pairsRejectedForDistance,
      pairing?.pairsRejectedForDistance,
      pairing?.pairCandidatesRejectedByDistance,
    ),
    pairsRejectedForMissingCoordinates: finiteNumber(
      debug?.pairsRejectedForMissingCoordinates,
      counts?.pairsRejectedForMissingCoordinates,
      pairing?.pairsRejectedForMissingCoordinates,
    ),
    extremeWalkingRoutesRejected: finiteNumber(
      debug?.extremeWalkingRoutesRejected,
      counts?.extremeWalkingRoutesRejected,
      pairing?.extremeWalkingRoutesRejected,
    ),
    invalidWalkingRoutesHiddenFromDisplay: finiteNumber(
      debug?.invalidWalkingRoutesHiddenFromDisplay,
      counts?.invalidWalkingRoutesHiddenFromDisplay,
      pairing?.invalidWalkingRoutesHiddenFromDisplay,
      pairing?.walkingPairsHiddenOverLimit,
    ),
    distanceMode: nonEmptyString(
      preference?.distanceMode,
      debug?.distanceMode,
      pairing?.pairDistanceMode,
    ),
    maxPairDistanceMiles: finiteNumber(
      preference?.maxPairDistanceMiles,
      debug?.maxPairDistanceMiles,
      pairing?.maxAllowedPairDistanceMiles,
    ),
    maxPairWalkingMinutes: finiteNumber(
      preference?.maxPairWalkingMinutes,
      debug?.maxPairWalkingMinutes,
      pairing?.maxAllowedPairWalkingMinutes,
    ),
    intentMs: finiteNumber(
      performance?.intent_parse_ms,
      performance?.intent_ms,
      performance?.intentMs,
      performance?.llm_ms,
      performance?.llmMs,
    ),
    searchMs: finiteNumber(
      performance?.search_ms,
      performance?.searchMs,
      performance?.rpc_ms,
      performance?.rpcMs,
      args.routeSearchMs,
    ),
    pairingMs: finiteNumber(
      performance?.pairing_ms,
      performance?.pairingMs,
    ),
    rankingMs: finiteNumber(
      performance?.ranking_ms,
      performance?.rankingMs,
    ),
    ...ml,
  };
}
