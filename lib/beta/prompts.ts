import type { BetaTask } from "@/types/beta";

export function isSearchBetaTask(task: Pick<BetaTask, "feature_area" | "test_url"> | null | undefined) {
  const area = task?.feature_area ?? "";
  return ["search_quality", "search_speed", "natural_search", "create_flow"].includes(area) || String(task?.test_url ?? "").startsWith("/create");
}
export function normalizeTesterPrompt(prompt: string | null | undefined) { return String(prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 500); }
export function isCustomPromptAllowed(task: Pick<BetaTask, "allow_custom_prompt" | "prompt_mode"> | null | undefined) { return Boolean(task?.allow_custom_prompt || task?.prompt_mode === "custom" || task?.prompt_mode === "either"); }
export function isCustomPromptRequired(task: Pick<BetaTask, "custom_prompt_required" | "prompt_mode"> | null | undefined) { return Boolean(task?.custom_prompt_required || task?.prompt_mode === "custom"); }
export function buildCreateUrlWithPrompt(baseUrl: string, prompt?: string | null, assignmentId?: string | null, usedCustomPrompt?: boolean) {
  const url = new URL(baseUrl || "/create", "https://theouthaven.local");
  const clean = normalizeTesterPrompt(prompt);
  if (clean && url.pathname === "/create") url.searchParams.set("q", clean);
  if (assignmentId) url.searchParams.set("betaAssignmentId", assignmentId);
  if (typeof usedCustomPrompt === "boolean") url.searchParams.set("usedCustomPrompt", String(usedCustomPrompt));
  return `${url.pathname}${url.search}${url.hash}`;
}
