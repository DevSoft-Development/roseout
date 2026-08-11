import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const layout = fs.readFileSync(
  path.join(process.cwd(), "app/reserve/location/[locationId]/layout.tsx"),
  "utf8",
);

describe("reservation venue tab width contract", () => {
  it("keeps the venue tab strip content-width on non-mobile screens", () => {
    expect(layout).toContain("width: fit-content");
    expect(layout).toContain("max-width: calc(100% - 3rem)");
    expect(layout).toContain("@media (min-width: 640px)");
  });
});
