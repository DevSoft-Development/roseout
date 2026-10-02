export function normalizedDemoSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isTheOutHavenLoungeSearch(value: unknown) {
  const normalized = normalizedDemoSearchText(value);
  const branded = normalized === "theouthaven lounge"
    ? "theouthaven lounge"
    : normalized === "the outhaven lounge"
      ? "the outhaven lounge"
      : normalized.startsWith("theouthaven lounge ")
        ? "theouthaven lounge"
        : normalized.startsWith("the outhaven lounge ")
          ? "the outhaven lounge"
          : null;
  if (!branded) return false;

  const suffix = normalized.slice(branded.length).trim();
  if (!suffix) return true;

  return /^(?:in|near|around|at|from)\b/.test(suffix);
}

export function requestContainsTheOutHavenLoungeSearch(body: any) {
  return [body?.message, body?.input, body?.query, body?.prompt]
    .some(isTheOutHavenLoungeSearch);
}
