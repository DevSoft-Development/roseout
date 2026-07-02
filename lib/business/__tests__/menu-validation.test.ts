import { describe, expect, it } from "vitest";
import { isValidMenuAction, menuResponseShape } from "../menu-validation";

describe("business menu API contract", () => {
  it("rejects invalid actions", () => {
    expect(isValidMenuAction("POST", "bad_action")).toBe(false);
    expect(isValidMenuAction("PATCH", "create_page")).toBe(false);
  });
  it("does not let PATCH create a new page accidentally", () => {
    expect(isValidMenuAction("PATCH", "create_page")).toBe(false);
  });
  it("includes page, sections, items, and previewUrl in the response shape", () => {
    expect(menuResponseShape({ location: { id: "l" }, page: { id: "p" }, sections: [], items: [], previewUrl: "/locations/restaurants/l/menu" })).toMatchObject({ ok: true, data: { page: { id: "p" }, sections: [], items: [], previewUrl: "/locations/restaurants/l/menu" } });
  });
});
