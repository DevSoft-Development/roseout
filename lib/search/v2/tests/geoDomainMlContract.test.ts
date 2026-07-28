import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const retrievalSource = fs.readFileSync(
  path.join(process.cwd(), "lib/search/v2/retrieval/retrieveUnifiedLocations.ts"),
  "utf8",
);
const responseSource = fs.readFileSync(
  path.join(process.cwd(), "lib/search/v2/response/buildPublicSearchResponse.ts"),
  "utf8",
);

describe("Search Core V2 geo, domain, and ML response contracts", () => {
  it("keeps the deployed Supabase RPC signature and enforces strict geo after retrieval", () => {
    expect(retrievalSource).toContain('"enterprise_search_locations"');
    expect(retrievalSource).toContain("p_search_terms");
    expect(retrievalSource).toContain("p_neighborhood");
    expect(retrievalSource).toContain("p_borough");
    expect(retrievalSource).toContain("p_city");
    expect(retrievalSource).toContain('geo.strictness !== "strict"');
    expect(retrievalSource).toContain("matchesStrictGeo");
  });

  it("publishes a primary domain derived from the canonical SearchPlan", () => {
    expect(responseSource).toContain("function primaryDomain");
    expect(responseSource).toContain('return "mixed"');
    expect(responseSource).toContain("primaryDomain: domain");
    expect(responseSource).toContain("primary_domain: domain");
  });

  it("distinguishes configured ML from the variant that actually served results", () => {
    expect(responseSource).toContain("configuredVariant");
    expect(responseSource).toContain("appliedVariant");
    expect(responseSource).toContain("shadowOnly");
    expect(responseSource).toContain('rankingVariant: appliedVariant');
    expect(responseSource).toContain('ML was configured but did not affect the served order.');
  });
});
