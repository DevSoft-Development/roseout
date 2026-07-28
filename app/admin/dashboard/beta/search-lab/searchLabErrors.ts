export type SearchLabSafeError = {
  error?: unknown;
  code?: unknown;
  requestId?: unknown;
  searchCoreOverride?: unknown;
};

export function formatSearchLabError(
  response: SearchLabSafeError | null,
  fallback = "Search test failed.",
) {
  if (!response || typeof response.error !== "string" || !response.error.trim()) {
    return fallback;
  }
  const details = [
    typeof response.code === "string" && response.code
      ? `Code: ${response.code}`
      : null,
    typeof response.requestId === "string" && response.requestId
      ? `Request ID: ${response.requestId}`
      : null,
    typeof response.searchCoreOverride === "string" && response.searchCoreOverride
      ? `Engine: ${response.searchCoreOverride}`
      : null,
  ].filter(Boolean);
  return [response.error, ...details].join("\n");
}
