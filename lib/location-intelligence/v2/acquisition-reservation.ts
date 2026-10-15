export function acquisitionReservationInput(input: {
  provider: string; capability: string; eventKey: unknown; maximumUsd: unknown;
}) {
  const eventKey = String(input.eventKey || "").trim();
  if (!/^[a-zA-Z0-9:_-]{12,128}$/.test(eventKey)) throw new Error("acquisition_stable_event_key_required");
  const estimatedUsd = Number(input.maximumUsd);
  if (input.maximumUsd == null || String(input.maximumUsd).trim() === "" ||
      !Number.isFinite(estimatedUsd) || estimatedUsd <= 0)
    throw new Error("acquisition_provider_price_unconfigured");
  return {
    p_event_key: `${eventKey}:${input.provider}`,
    p_provider: input.provider,
    p_operation: input.capability,
    p_estimated_usd: estimatedUsd,
  };
}

/** A failed paid call may have been billed remotely; never retry another provider. */
export function mustStopAcquisitionFallback(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("paid_acquisition_outcome_uncertain:");
}
