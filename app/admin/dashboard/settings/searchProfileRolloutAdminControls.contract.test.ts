import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("admin Search Profile rollout controls", () => {
  it("renders all rollout modes and the emergency kill switch", () => {
    const client = read("app/admin/dashboard/settings/SearchProfileRolloutClient.tsx");
    expect(client).toContain('"off"');
    expect(client).toContain('"shadow"');
    expect(client).toContain('"canary"');
    expect(client).toContain('"primary"');
    expect(client).toContain("Emergency kill switch");
    expect(client).toContain("SEARCH_PROFILE_CANARY_PERCENT");
  });
});
