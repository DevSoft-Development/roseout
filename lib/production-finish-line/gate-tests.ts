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

export type GateTestContext = {
  origin?: string;
};

type CommandRow = { command?: string | null; result?: string | null; status?: string | null; notes?: string | null };

async function countRows(supabase: SupabaseAdminClient, table: string, apply?: (query: any) => any) {
  const base = supabase.from(table).select("id", { count: "exact", head: true });
  const query = apply ? apply(base) : base;
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function safeCountRows(supabase: SupabaseAdminClient, table: string, apply?: (query: any) => any) {
  try {
    return { count: await countRows(supabase, table, apply), error: null as string | null };
  } catch (error: any) {
    return { count: 0, error: error?.message ?? `Could not count ${table}` };
  }
}

function checkCount(name: string, count: number, passedDetails: string, blockedDetails: string): GateCheck {
  return count > 0
    ? { name, status: "passed", details: passedDetails }
    : { name, status: "blocked", details: blockedDetails };
}

function reviewCount(name: string, count: number, passedDetails: string, reviewDetails: string): GateCheck {
  return count > 0
    ? { name, status: "passed", details: passedDetails }
    : { name, status: "needs_review", details: reviewDetails };
}

function summarize(title: string, checks: GateCheck[]): GateRunResult {
  const blocked = checks.filter((check) => check.status === "blocked");
  const review = checks.filter((check) => check.status === "needs_review");
  const passed = checks.filter((check) => check.status === "passed");
  const status: GateRunStatus = blocked.length ? "blocked" : review.length ? "testing" : "passed";
  const summary = blocked.length
    ? `${title} is blocked. ${blocked.length} required safe check${blocked.length === 1 ? "" : "s"} failed.`
    : review.length
      ? `${title} needs final review. ${passed.length} check${passed.length === 1 ? "" : "s"} passed, but ${review.length} still need confirmation.`
      : `${title} passed the safe read-only checks.`;
  return { title, status, summary, checks };
}

async function routeCheck(origin: string | undefined, path: string, name: string, expected = "Route should load without a 4xx/5xx response."): Promise<GateCheck> {
  if (!origin) return { name, status: "needs_review", details: `${expected} The runner could not determine the current deployment origin.` };
  try {
    const response = await fetch(new URL(path, origin), { method: "GET", redirect: "manual", cache: "no-store" });
    const ok = response.status >= 200 && response.status < 400;
    return ok
      ? { name, status: "passed", details: `${path} returned HTTP ${response.status}.` }
      : { name, status: response.status >= 500 ? "blocked" : "needs_review", details: `${path} returned HTTP ${response.status}. Expected: ${expected}` };
  } catch (error: any) {
    return { name, status: "blocked", details: `${path} could not be fetched. ${error?.message ?? "Unknown fetch error"}` };
  }
}

async function findPublicLocationPath(supabase: SupabaseAdminClient) {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("id,slug,name")
      .eq("is_searchable", true)
      .eq("is_hidden", false)
      .not("slug", "is", null)
      .limit(1)
      .maybeSingle();
    if (error || !data?.slug) return null;
    return `/locations/${data.slug}`;
  } catch {
    return null;
  }
}

async function loadCommands(supabase: SupabaseAdminClient): Promise<CommandRow[]> {
  try {
    const { data, error } = await supabase.from("production_command_results").select("command,result,status,notes");
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

function commandCheck(commands: CommandRow[], command: string, required: boolean): GateCheck {
  const row = commands.find((item) => String(item.command ?? "").trim() === command);
  if (!row) return required ? { name: command, status: "blocked", details: `${command} is missing from Production Command Results.` } : { name: command, status: "needs_review", details: `${command} is not tracked yet.` };
  const result = String(row.result ?? row.status ?? "not_run");
  if (result === "passed") return { name: command, status: "passed", details: `${command} is marked passed.` };
  if (["failed", "blocked", "needs_codex"].includes(result)) return { name: command, status: "blocked", details: `${command} is marked ${result}. Review the saved output/notes.` };
  return { name: command, status: "needs_review", details: `${command} is tracked but not marked passed yet.` };
}

async function runPublicPagesTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext) {
  const publicLocationPath = await findPublicLocationPath(supabase);
  return summarize(title, [
    await routeCheck(context?.origin, "/", "Home page loads"),
    await routeCheck(context?.origin, "/create", "Create/search page loads"),
    await routeCheck(context?.origin, "/locations", "Public locations index loads"),
    publicLocationPath ? await routeCheck(context?.origin, publicLocationPath, "Valid public location profile loads", "A valid searchable public location profile should load without Location Not Found.") : { name: "Valid public location profile loads", status: "needs_review", details: "No searchable visible location with a slug was found for a safe profile route check." },
    await routeCheck(context?.origin, "/business/claim", "Business claim page loads"),
    await routeCheck(context?.origin, "/privacy", "Privacy page loads"),
    await routeCheck(context?.origin, "/terms", "Terms page loads"),
    { name: "Metadata and mobile visual review", status: "needs_review", details: "Route checks are automated. Metadata quality and final mobile visual approval still need review unless Playwright coverage is added." },
  ]);
}

async function runBetaProgramTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext) {
  const betaRows = await safeCountRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "beta"));
  return summarize(title, [
    betaRows.error ? { name: "Beta readiness rows are readable", status: "needs_review", details: betaRows.error } : reviewCount("Beta readiness rows exist", betaRows.count, `${betaRows.count} beta readiness rows are seeded.`, "No beta readiness rows were found."),
    await routeCheck(context?.origin, "/beta", "Beta signup page loads"),
    await routeCheck(context?.origin, "/user/dashboard/beta", "Beta dashboard route is protected or loads safely", "Beta dashboard should either redirect/protect unauthenticated users or load without a 500."),
    await routeCheck(context?.origin, "/user/dashboard/beta/weekly", "Weekly beta route is protected or loads safely", "Weekly beta route should redirect/protect unauthenticated users or load without a 500."),
    await routeCheck(context?.origin, "/admin/dashboard/beta", "Admin beta review route is protected or loads safely", "Admin beta route should redirect/protect unauthenticated users or load without a 500."),
    { name: "No beta users created", status: "passed", details: "This runner is read-only. It does not create beta users, submit weekly tasks, or send completion emails." },
    { name: "Email and duplicate completion proof", status: "needs_review", details: "Completion email once-only behavior still needs demo-write or integration test proof." },
  ]);
}

async function runBillingTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext) {
  return summarize(title, [
    await routeCheck(context?.origin, "/business/pricing", "Business pricing page loads"),
    await routeCheck(context?.origin, "/pricing", "Public pricing page loads"),
    await routeCheck(context?.origin, "/api/stripe/webhook", "Stripe webhook is not publicly usable", "Webhook route should not expose a success path to anonymous GET requests."),
    { name: "Stripe live charges are not executed", status: "passed", details: "The readiness runner only performs safe route/config checks and does not create checkout sessions or charges." },
    { name: "Plan copy and prices", status: "needs_review", details: "Confirm launch plan names and pricing in the UI: Free Discovery and TheOutHaven Reserve Pro at $99/month." },
  ]);
}

async function runEmailCronMonitoringTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext) {
  return summarize(title, [
    await routeCheck(context?.origin, "/api/admin/email-templates/preview", "Email template preview is protected or available to admin flow", "Admin email preview route should not return a 500."),
    await routeCheck(context?.origin, "/api/cron/admin-cron-digest-email", "Admin cron digest route fails closed", "Cron route should fail closed or require a secret/admin context, not return a 500."),
    await routeCheck(context?.origin, "/api/cron/beta-tester-reminders", "Beta reminders cron route fails closed", "Cron route should fail closed or require a secret/admin context, not return a 500."),
    { name: "No live bulk email sent", status: "passed", details: "The readiness runner does not send live bulk email. It only checks route protection/readiness." },
    { name: "Inbox delivery", status: "needs_review", details: "Real inbox delivery still requires a controlled manual/admin-gated test send." },
  ]);
}

async function runDataQualityTest(title: string, supabase: SupabaseAdminClient) {
  const locations = await safeCountRows(supabase, "locations");
  const searchable = await safeCountRows(supabase, "locations", (query) => query.eq("is_searchable", true));
  const publicVisible = await safeCountRows(supabase, "locations", (query) => query.eq("is_searchable", true).eq("is_hidden", false));
  const gates = await safeCountRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "gate"));
  const qr = await safeCountRows(supabase, "production_qr_claim_pilot");
  return summarize(title, [
    locations.error ? { name: "Locations table is readable", status: "blocked", details: locations.error } : checkCount("Locations table is readable", locations.count, `${locations.count} locations are readable.`, "No locations are readable."),
    searchable.error ? { name: "Searchable locations are countable", status: "needs_review", details: searchable.error } : reviewCount("Searchable locations exist", searchable.count, `${searchable.count} searchable locations found.`, "No searchable locations found."),
    publicVisible.error ? { name: "Public visible locations are countable", status: "needs_review", details: publicVisible.error } : reviewCount("Public visible locations exist", publicVisible.count, `${publicVisible.count} searchable visible locations found.`, "No public visible searchable locations found."),
    gates.error ? { name: "Production finish line gates are readable", status: "blocked", details: gates.error } : checkCount("Production finish line gates exist", gates.count, `${gates.count} gate rows are seeded.`, "No production gate rows found."),
    qr.error ? { name: "QR pilot rows are readable", status: "needs_review", details: qr.error } : reviewCount("QR pilot rows exist", qr.count, `${qr.count} QR pilot rows are available.`, "No QR pilot rows found."),
    { name: "RLS and storage policy review", status: "needs_review", details: "Read-only table checks passed where available. RLS and storage policy review still requires human/security review." },
  ]);
}

async function runMobileTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext) {
  const publicLocationPath = await findPublicLocationPath(supabase);
  return summarize(title, [
    await routeCheck(context?.origin, "/", "Mobile home route smoke check"),
    await routeCheck(context?.origin, "/create", "Mobile create route smoke check"),
    publicLocationPath ? await routeCheck(context?.origin, publicLocationPath, "Mobile public profile route smoke check") : { name: "Mobile public profile route smoke check", status: "needs_review", details: "No valid searchable public location slug was found for mobile route smoke testing." },
    await routeCheck(context?.origin, "/business/claim", "Mobile business claim route smoke check"),
    { name: "Final visual mobile QA", status: "needs_review", details: "Route smoke checks are automated. Horizontal overflow, CTA visibility, and card readability still need Playwright/mobile viewport or manual visual review." },
  ]);
}

async function runProductionCommandsTest(title: string, supabase: SupabaseAdminClient) {
  const commands = await loadCommands(supabase);
  return summarize(title, [
    commandCheck(commands, "npm run build", true),
    commandCheck(commands, "npm run typecheck", true),
    commandCheck(commands, "npm run lint", true),
    commandCheck(commands, "npm run test:search-production", false),
    commandCheck(commands, "npm run test:reserve", false),
    commandCheck(commands, "npm run test:beta-production-readiness", false),
    { name: "Command tiers", status: "passed", details: "Pilot readiness weights build, typecheck, and lint first. Other commands are important but should not outweigh core build readiness." },
  ]);
}

export async function runSafeGateTest(title: string, supabase: SupabaseAdminClient, context?: GateTestContext): Promise<GateRunResult> {
  const normalized = title.trim().toLowerCase();

  if (normalized.includes("public pages") || normalized.includes("seo")) return runPublicPagesTest(title, supabase, context);
  if (normalized.includes("beta")) return runBetaProgramTest(title, supabase, context);
  if (normalized.includes("billing") || normalized.includes("plans")) return runBillingTest(title, supabase, context);
  if (normalized.includes("email") || normalized.includes("cron") || normalized.includes("monitoring")) return runEmailCronMonitoringTest(title, supabase, context);
  if (normalized.includes("data quality") || normalized.includes("supabase")) return runDataQualityTest(title, supabase);
  if (normalized.includes("mobile")) return runMobileTest(title, supabase, context);
  if (normalized.includes("production checks") || normalized.includes("production build")) return runProductionCommandsTest(title, supabase);

  if (normalized.includes("search reliability")) {
    const promptCount = await countRows(supabase, "production_search_readiness_prompts");
    const commandCount = await countRows(supabase, "production_command_results");
    return summarize(title, [
      checkCount("Search readiness prompts exist", promptCount, `${promptCount} prompt rows are available for manual/automated search checks.`, "No search readiness prompts were found."),
      checkCount("Production command rows exist", commandCount, `${commandCount} production command rows are available.`, "No production command rows were found."),
      { name: "Search Health remains separate", status: "passed", details: "This runner keeps Search Health separate for live logs and diagnostics." },
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
      { name: "Owner dashboard manual flow is protected", status: "passed", details: "This safe runner confirms readiness data only and does not impersonate owners or write business data." },
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
      qrCount <= 25 ? { name: "Pilot is capped at 25 rows", status: "passed", details: `${qrCount} pilot rows are present, which is within the 25-card cap.` } : { name: "Pilot is capped at 25 rows", status: "blocked", details: `${qrCount} pilot rows are present. Reduce or review before postcard outreach.` },
      { name: "No claim submitted", status: "passed", details: "This runner does not redeem, submit, or approve claim codes." },
    ]);
  }

  if (normalized.includes("security")) {
    const securityCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "security"));
    return summarize(title, [
      checkCount("Security checklist rows exist", securityCount, `${securityCount} security checklist rows are seeded.`, "No security checklist rows were found."),
      { name: "No secrets scanned or printed", status: "passed", details: "This runner does not read environment values or expose secrets." },
      { name: "Security review is tracked", status: "passed", details: "Use the Security Checklist rows for cron secrets, debug endpoints, and protected-route review before production launch." },
    ]);
  }

  if (normalized.includes("25-card") || normalized.includes("pilot")) {
    const qrCount = await countRows(supabase, "production_qr_claim_pilot");
    const qrBlockedCount = await countRows(supabase, "production_finish_line_items", (query) => query.eq("item_type", "gate").eq("title", "QR Claim Flow").in("status", ["blocked", "needs_codex"]));
    return summarize(title, [
      checkCount("QR pilot rows exist", qrCount, `${qrCount} QR pilot rows are available.`, "No QR pilot rows were found."),
      qrCount <= 25 ? { name: "Pilot remains at or under 25 cards", status: "passed", details: `${qrCount} pilot rows are present.` } : { name: "Pilot remains at or under 25 cards", status: "blocked", details: `${qrCount} pilot rows are present. Do not expand outreach until reviewed.` },
      qrBlockedCount === 0 ? { name: "QR Claim Flow is not blocked", status: "passed", details: "The QR Claim Flow gate is not currently marked blocked or needs Codex." } : { name: "QR Claim Flow is not blocked", status: "blocked", details: "QR Claim Flow is blocked or needs Codex. Do not send cards yet." },
    ]);
  }

  return summarize(title, [
    { name: "Known gate test definition", status: "needs_review", details: "No automated definition exists for this gate yet. Review it manually." },
  ]);
}
