import { describe, expect, it } from "vitest";
describe("Search Core V2 validation", () => { it("loads the integrated module", async () => { const searchModule = await import("../index"); expect(searchModule.searchV2).toBeTypeOf("function"); }); });
