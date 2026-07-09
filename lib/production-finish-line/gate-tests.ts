type SupabaseAdminClient = {
  from: (table: string) => any;
};

export type GateCheckStatus = "passed" | "blocked" | "needs_review";
export type GateRunStatus = "passed" | "testing" | "blocked" | "needs_codex";

export type GateCheck = {
  name: string;
  status: GateCheckStatus;
  details: string;
};

export type GateRunResult = {
  title: string;
  status: GateRunStatus;
  summary: string;
  checks: GateCheck[];
};

async function countRows(supabase: SupabaseAdminClient, table: string, apply?: (query: any) => any) {
  const base = supabase.from(table).select("id", { count: "exact", head: true });
  const query = apply ? apply(base) : base;
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function checkCount(name: string, count: number, passedDetails: string, blockedDetails: string): GateCheck {
  return count > 0
    ? { name, status: "passed", details: passedDetails }
    : { name, status: "blocked", details: blockedDetails };
}

function summarize(title: string, checks: GateCheck[]): GateRunResult {
  const blocked = checks.filter((check) => check.status === "blocked");
  const review = checks.filter((check) => check.status === "needs_review");
  const passed = checks.filter((check) => check.status === "passed");

  const status: GateRunStatus = blocked.length ? "blocked" : review.length ? "testing" : "passed";
  const summary = blocked.length
    ? `${title} is blocked. ${blocked.length} required safe check${blocked.length === 1 ? "" : "s"} failed.`
    : review.length
      ? `${title} needs review. ${passed.length} check${passed.length === 1 ? "" : "s"} passed, but ${review.length} need human confirmation.`
      : `${title} passed the safe read-only checks.`;

  return { title, status, summary, checks };
}

export async function runSafeGateTest(title: string, supabase: SupabaseAdminClient): Promise<GateRunResult> {
  const normalized = title.trim().toLowerCase();

  if (normalized.includes("search reliability")) {
    const promptCount = await countRows(supabase, "production_search_readiness_prompts");
    const commandCount = await countRows(supabase, "production_command_results");
    return summarize(title, [
      checkCount("Search readiness prompts exist", promptCount, `${promptCount} prompt rows are available for manual/automated search checks.`, "No search readiness prompts were found."),
      checkCount("Production command rows exist", commandCount, `${commandCount} production command rows are available.`, "No production command rows were found."),
      { name: "Search Health remains separate", status: "needs_review", details: "This runner does not replace Search Health. Open Search Health for live logs and diagnostics." },
    ]);
  }

  if (normalized.includes("location access")) {
    const accessCount = await countRows(supabase, "production_access_tests");
    const gateCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "gate"));
    return summarize(title, [
      checkCount("Access matrix rows exist", accessCount, `${accessCount} role/access checks are seeded.`, "No access matrix rows were found."),
      checkCount("Launch gates exist", gateCount, `${gateCount} launch gates are seeded.`, "No launch gates were found."),
    ]);
  }

  if (normalized.includes("owner dashboard")) {
    const gateCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "gate"));
    const accessCount = await countRows(supabase, "production_access_tests");
    return summarize(title, [
      checkCount("Owner/access test data exists", accessCount, `${accessCount} access rows are available to validate owner/dashboard permissions.`, "No access test rows were found for owner/dashboard review."),
      checkCount("Production gate data exists", gateCount, `${gateCount} launch gates are available.`, "No launch gates were found."),
      { name: "Human owner dashboard check still required", status: "needs_review", details: "This safe runner does not impersonate owners or write business data. Verify dashboard links in the UI." },
    ]);
  }

  if (normalized === "reserve" || normalized.includes("reserve")) {
    const reserveCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "reserve"));
    return summarize(title, [
      checkCount("Reserve checklist rows exist", reserveCount, `${reserveCount} Reserve checklist rows are seeded.`, "No Reserve checklist rows were found."),
      { name: "No fake reservations created", status: "passed", details: "This runner only checks readiness data. It does not create reservations, waitlist entries, or walk-ins." },
    ]);
  }

  if (normalized.includes("qr claim")) {
    const qrCount = await countRows(supabase, "production_qr_claim_pilot");
    return summarize(title, [
      checkCount("QR pilot rows exist", qrCount, `${qrCount} QR pilot rows are available.`, "No QR pilot rows were found."),
      qrCount <= 25
        ? { name: "Pilot is capped at 25 rows", status: "passed", details: `${qrCount} pilot rows are present, which is within the 25-card cap.` }
        : { name: "Pilot is capped at 25 rows", status: "blocked", details: `${qrCount} pilot rows are present. Reduce or review before postcard outreach.` },
      { name: "No claim submitted", status: "passed", details: "This runner does not redeem, submit, or approve claim codes." },
    ]);
  }

  if (normalized.includes("beta")) {
    const betaCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "beta"));
    return summarize(title, [
      checkCount("Beta checklist rows exist", betaCount, `${betaCount} beta readiness rows are seeded.`, "No beta readiness rows were found."),
      { name: "No beta users created", status: "passed", details: "This runner does not create beta users, test sessions, or submissions." },
    ]);
  }

  if (normalized.includes("security")) {
    const securityCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "security"));
    return summarize(title, [
      checkCount("Security checklist rows exist", securityCount, `${securityCount} security checklist rows are seeded.`, "No security checklist rows were found."),
      { name: "No secrets scanned or printed", status: "passed", details: "This runner does not read environment values or expose secrets." },
      { name: "Human security review still required", status: "needs_review", details: "Confirm protected routes, cron secrets, and debug endpoints before production launch." },
    ]);
  }

  if (normalized.includes("production checks")) {
    const commandCount = await countRows(supabase, "production_command_results");
    return summarize(title, [
      checkCount("Production command rows exist", commandCount, `${commandCount} production command rows are available to track build/typecheck/test results.`, "No production command rows were found."),
      { name: "Commands are not run in browser", status: "passed", details: "This runner stores command readiness only. Run build/typecheck/test in CI, Vercel, terminal, or Codex." },
    ]);
  }

  if (normalized.includes("25-card") || normalized.includes("pilot")) {
    const qrCount = await countRows(supabase, "production_qr_claim_pilot");
    const qrBlockedCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "gate").eq("title", "QR Claim Flow").in("status", ["blocked", "needs_codex"]));
    return summarize(title, [
      checkCount("QR pilot rows exist", qrCount, `${qrCount} QR pilot rows are available.`, "No QR pilot rows were found."),
      qrCount <= 25
        ? { name: "Pilot remains at or under 25 cards", status: "passed", details: `${qrCount} pilot rows are present.` }
        : { name: "Pilot remains at or under 25 cards", status: "blocked", details: `${qrCount} pilot rows are present. Do not expand outreach until reviewed.` },
      qrBlockedCount === 0
        ? { name: "QR Claim Flow is not blocked", status: "passed", details: "The QR Claim Flow gate is not currently marked blocked or needs Codex." }
        : { name: "QR Claim Flow is not blocked", status: "blocked", details: "QR Claim Flow is blocked or needs Codex. Do not send cards yet." },
    ]);
  }

  return summarize(title, [
    { name: "Known gate test definition", status: "needs_review", details: "No automated definition exists for this gate yet. Review it manually." },
  ]);
}
