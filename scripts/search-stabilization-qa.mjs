import { writeFile } from "node:fs/promises";

const prompts = [
  "Steak dinner and rooftop drinks in Manhattan",
  "Sushi in Flushing with karaoke after",
  "Best bar to watch the Knicks game in Harlem",
  "Seafood restaurant near the Paramount in Huntington",
  "Restaurant with hookah lounge after in Queens",
  "Casual dinner and a relaxed activity in Long Island City",
  "Italian dinner and bowling within 20 minutes walking distance",
  "Halal restaurant and arcade near Jamaica Queens",
  "Brunch in Williamsburg with an art gallery nearby",
  "Mexican dinner and comedy show in Manhattan",
  "Date night near Barclays Center with dinner and an activity",
  "Family-friendly activity and restaurant in Garden City",
  "Vegan dinner and live music in Brooklyn",
  "Rooftop dinner in Queens",
  "Seafood dinner with theater after in Midtown",
  "Dinner and mini golf in Nassau County",
  "Restaurant near Gaming City in Astoria",
  "Girls night dinner with cocktails and dancing in Brooklyn",
  "Fun activity with my teenage son in Queens",
  "Chicken lunch in Astoria",
];

const baseUrl = process.env.SEARCH_TEST_BASE_URL ?? "http://localhost:3000";
const results = [];
for (const query of prompts) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, debug: true }), signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    const keys = body?.debug?.recoveryKeys ?? [];
    const duplicateKeys = keys.length - new Set(keys).size;
    const mixed = Boolean(body?.debug?.normalizedIntent?.wantsPairing);
    const honest = (body?.pairs?.length ?? 0) > 0 || ["partial_mixed", "empty", "restaurant_cards", "activity_cards"].includes(body?.primaryResultType);
    results.push({ query, pass: response.ok && (!mixed || honest) && duplicateKeys === 0, httpStatus: response.status, status: body.status, primaryResultType: body.primaryResultType, restaurants: body.restaurants?.length ?? 0, activities: body.activities?.length ?? 0, pairs: body.pairs?.length ?? 0, candidateCounts: body.candidate_counts ?? body.candidateCounts ?? null, displayedCounts: body.displayed_counts ?? body.displayedCounts ?? null, recoveryRpcCount: body?.debug?.recoveryRpcCount ?? null, rpcDedupedCount: body?.debug?.rpcDedupedCount ?? null, duplicateRecoveryKeys: duplicateKeys, elapsedMs: Date.now() - started, message: body.reply ?? body.message ?? body.error?.message ?? null });
  } catch (error) {
    results.push({ query, pass: false, error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - started });
  }
}
const artifact = { generatedAt: new Date().toISOString(), baseUrl, passed: results.filter((row) => row.pass).length, failed: results.filter((row) => !row.pass).length, results };
await writeFile("docs/search-stabilization-qa.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
if (artifact.failed) process.exitCode = 1;
