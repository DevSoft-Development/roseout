import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";

const adapterSource = fs.readFileSync(
  path.join(process.cwd(), "lib/search/v2/response/compatibilityAdapter.ts"),
  "utf8",
);
const retrievalSource = fs.readFileSync(
  path.join(process.cwd(), "lib/search/v2/retrieval/retrieveUnifiedLocations.ts"),
  "utf8",
);

describe("Search Core V2 retrieval, pairing, and telemetry contracts", () => {
  it("broadens live music retrieval without dropping the activity lane", async () => {
    const plan = await buildSearchPlan({
      input: { query: "Italian dinner with live music nearby in Manhattan" },
    });
    const requests = buildRetrievalRequests(plan);
    const activity = requests.find((request) => request.desiredRole.includes("activity"));

    expect(activity).toBeDefined();
    expect(activity?.retrievalTerms).toEqual(
      expect.arrayContaining(["live music", "concert", "activity"]),
    );
  });

  it("creates a broad activity request for generic family activity intent", async () => {
    const plan = await buildSearchPlan({
      input: { query: "Family-friendly activity with dinner afterward in Long Island City" },
    });
    const requests = buildRetrievalRequests(plan);
    const activity = requests.find((request) => request.desiredRole === "general_activity");

    expect(activity?.retrievalTerms).toEqual(
      expect.arrayContaining(["activity", "entertainment", "things to do"]),
    );
  });

  it("keeps strict geography while accepting sparse borough-backed neighborhood rows", () => {
    expect(retrievalSource).toContain("boroughBackedSparseRow");
    expect(retrievalSource).toContain('geo.strictness !== "strict"');
    expect(retrievalSource).toContain("exactPlaceMatch");
  });

  it("lifts V2 primary domain and result type into the current QA contract", () => {
    expect(adapterSource).toContain("primary_domain: v2.primary_domain");
    expect(adapterSource).toContain("primaryDomain: v2.primaryDomain");
    expect(adapterSource).toContain("primaryResultType: v2.displayMode");
  });
});
