import { describe, expect, it } from "vitest";
describe("Search Core V2 retrieval", () => { it("loads the integrated module", async () => { const module = await import("../index"); expect(module.searchV2).toBeTypeOf("function"); }); });
