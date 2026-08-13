import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("website deploy transport", () => {
  it("signs app deploy requests", () => {
    const code = source("lib/websites/deploy-client.ts");
    expect(code).toContain('createHmac("sha256"');
    expect(code).toContain('"x-toh-timestamp"');
    expect(code).toContain('"x-toh-signature"');
    expect(code).toContain("normalizeDeployRequest");
  });

  it("keeps the node agent bounded to generated-site releases", () => {
    const code = source("ops/website-deploy-agent.mjs");
    expect(code).toContain('payload.sitePath !== `/srv/sites/${payload.locationId}`');
    expect(code).toContain("timingSafeEqual");
    expect(code).toContain("payload.files.length > 50");
    expect(code).toContain('execFileAsync("caddy"');
    expect(code).not.toContain("exec(");
  });
});
