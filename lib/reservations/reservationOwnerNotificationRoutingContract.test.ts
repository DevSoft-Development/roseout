import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const route = fs.readFileSync(
  path.join(repoRoot, "app/api/reserve/location/route.ts"),
  "utf8",
);
const growthMigration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260627000000_growth_pro_foundation.sql"),
  "utf8",
);

describe("reservation owner notification routing contract", () => {
  it("uses the canonical reservation owner email before generic fallbacks", () => {
    expect(growthMigration).toContain("reservation_owner_email text");
    expect(route).toContain("location?.reservation_owner_email ||");
    expect(route.indexOf("location?.reservation_owner_email ||")).toBeLessThan(
      route.indexOf("location?.owner_email ||"),
    );
  });

  it("uses the canonical reservation phone before generic location phone fallbacks", () => {
    expect(growthMigration).toContain("reservation_phone text");
    expect(route).toContain("location?.reservation_phone ||");
    expect(route.indexOf("location?.reservation_phone ||")).toBeLessThan(
      route.indexOf("location?.phone ||"),
    );
  });

  it("retains safe owner contact fallbacks", () => {
    expect(route).toContain("location?.owner_email ||");
    expect(route).toContain("location?.claimed_by_email ||");
    expect(route).toContain("location?.webmaster_email ||");
    expect(route).toContain("location?.owner_phone ||");
    expect(route).toContain("location?.webmaster_phone ||");
  });
});
