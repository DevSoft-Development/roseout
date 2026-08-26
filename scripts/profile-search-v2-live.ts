const BASE_URL = process.env.SEARCH_QA_BASE_URL || "https://www.theouthaven.com";
const BETA_TESTER_ID = process.env.SEARCH_QA_BETA_TESTER_ID || "";
const SESSION_ID = process.env.SEARCH_QA_SESSION_ID || `search-profile-${Date.now()}`;
const GUEST_ID = process.env.SEARCH_QA_GUEST_ID || SESSION_ID;
const MIN_INTERVAL_MS = Number(process.env.SEARCH_QA_MIN_INTERVAL_MS || 2200);

if (!BETA_TESTER_ID) throw new Error("SEARCH_QA_BETA_TESTER_ID is required");

const QUERIES = [
  "date night in Brooklyn",
  "birthday dinner and something fun in Forest Hills",
  "family outing in Astoria no nightclub",
  "dinner then hookah in Brooklyn",
  "something fun to do in Brooklyn",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (const [index, query] of QUERIES.entries()) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const response = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-session-id": SESSION_ID,
        "x-beta-tester-id": BETA_TESTER_ID,
        cookie: `guest_search_id=${GUEST_ID}`,
      },
      body: JSON.stringify({ input: query }),
    });
    const payload: any = await response.json().catch(() => null);
    const elapsedMs = Date.now() - started;
    const timing = payload?.timing ?? payload?.searchV2?.timing ?? null;
    const retrievalCalls = payload?.debug?.retrievalCalls ?? payload?.searchV2?.debug?.retrievalCalls ?? [];
    const phase13 = payload?.debug?.phase13ProductionIntegration ?? payload?.normalizedIntent?.semantic ?? null;
    console.log("SEARCH_V2_PROFILE", JSON.stringify({
      index: index + 1,
      query,
      requestId,
      status: response.status,
      elapsedMs,
      timing,
      retrievalCalls,
      phase13,
      counts: {
        restaurants: payload?.restaurants?.length ?? 0,
        activities: payload?.activities?.length ?? 0,
        pairs: payload?.pairs?.length ?? 0,
      },
    }));
    if (index < QUERIES.length - 1) await sleep(Math.max(MIN_INTERVAL_MS, 2200));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
