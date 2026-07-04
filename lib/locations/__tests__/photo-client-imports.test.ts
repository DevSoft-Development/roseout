import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forbiddenClientImports = [
  "@/lib/locations/photos",
  "@/lib/supabase-admin",
  "@/lib/env",
  "server-only",
];

describe("client-safe location photo helper imports", () => {
  for (const file of ["lib/locationImage.ts", "lib/publicCardImage.ts", "lib/publicLocationPhotos.ts", "lib/locations/photo-public.ts"]) {
    it(`${file} does not import server-only photo dependencies`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of forbiddenClientImports) {
        expect(source).not.toContain(forbidden);
      }
    });
  }
});
