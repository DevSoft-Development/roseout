export type GuidedSearchPlanType = "outing" | "restaurant" | "activity";

export type GuidedSearchPromptInput = {
  query: string;
  planType: GuidedSearchPlanType;
  location?: string | null;
  when?: string | null;
  customDate?: string | null;
  customTime?: string | null;
  preferences?: readonly string[] | null;
  customMatters?: readonly string[] | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: readonly string[] | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

export function buildGuidedSearchPrompt(input: GuidedSearchPromptInput) {
  const query = text(input.query);
  if (!query) return "";

  const typeInstruction = input.planType === "restaurant"
    ? "restaurant only"
    : input.planType === "activity"
      ? "activity only"
      : "restaurant and activity outing";

  const rawWhen = text(input.when);
  const normalizedWhen = ["none", "no specific time"].includes(rawWhen.toLowerCase()) ? "" : rawWhen;
  const timing = [
    text(input.customDate) || normalizedWhen || null,
    text(input.customTime) || null,
  ].filter(Boolean).join(" ");
  const allMatters = [...list(input.preferences), ...list(input.customMatters)];

  return [
    `Plan a ${typeInstruction}.`,
    query,
    `Location: ${text(input.location) || "near me"}.`,
    timing ? `When: ${timing}.` : "",
    allMatters.length ? `Preferences: ${allMatters.join(", ")}.` : "",
    "Return the best options, ranked by fit.",
  ].filter(Boolean).join(" ");
}
