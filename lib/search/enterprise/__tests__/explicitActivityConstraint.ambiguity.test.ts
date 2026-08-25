import { describe, expect, it } from "vitest";

import { resolveExplicitActivityConstraint } from "../explicitActivityConstraint";

describe("explicit activity constraint ambiguity", () => {
  it("does not treat the verb show as a theater request", () => {
    expect(
      resolveExplicitActivityConstraint("show me date night ideas in Brooklyn"),
    ).toMatchObject({
      applied: false,
      requestedIds: [],
    });
  });

  it("keeps comedy show constrained to comedy instead of adding theater", () => {
    expect(
      resolveExplicitActivityConstraint("restaurant and comedy show in Manhattan"),
    ).toMatchObject({
      applied: true,
      requestedIds: ["comedy"],
    });
  });
});
