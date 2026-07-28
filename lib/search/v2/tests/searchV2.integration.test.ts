import { describe, expect, it } from "vitest";
describe("Search Core V2 searchV2.integration", () => { it("loads the integrated module", async () => { const module = await import("../index"); expect(module.searchV2).toBeTypeOf("function"); }); });
