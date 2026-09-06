import { describe, expect, it, vi } from "vitest";
import { retrieveExactMenuDishRows } from "../retrieveExactMenuDishRows";

function queryResult(data: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data, error: null })),
    in: vi.fn(() => chain),
    then: (resolve: any) => resolve({ data, error: null }),
  };
  return chain;
}

describe("exact menu dish retrieval", () => {
  it("hydrates searchable restaurants from ready multi-word menu evidence", async () => {
    const menuChain = queryResult([{ location_id: "loc-1", item_name: "Rasta Pasta (Catering)", normalized_item_name: "rasta pasta catering", status: "ready" }]);
    const locationChain = queryResult([{ id: "loc-1", name: "Nyam Sum Jamaican Cuisine", is_searchable: true, is_hidden: false, signature_items: [] }]);
    const supabase: any = { from: vi.fn((table: string) => table === "location_menu_item_embeddings_hf" ? menuChain : locationChain) };
    const trace: any = { decisions: [] };
    const request: any = { desiredRole: "restaurant", foods: ["rasta pasta", "rasta", "pasta"], cuisines: [], categories: [], features: [], retrievalTerms: ["rasta pasta"], geo: {} };
    const rows = await retrieveExactMenuDishRows({ plan: { geo: { market: "NYC_LONG_ISLAND" } } as any, supabase, requests: [request], trace });
    expect(rows).toHaveLength(1);
    expect(rows[0].location.signature_items).toContain("Rasta Pasta (Catering)");
    expect(rows[0].location.exact_menu_inventory_match).toBe(true);
  });

  it("does not run exact-menu retrieval for generic single-word food terms", async () => {
    const supabase: any = { from: vi.fn() };
    const trace: any = { decisions: [] };
    const request: any = { desiredRole: "restaurant", foods: ["pasta"], cuisines: [], categories: [], features: [], retrievalTerms: ["pasta"], geo: {} };
    const rows = await retrieveExactMenuDishRows({ plan: { geo: { market: null } } as any, supabase, requests: [request], trace });
    expect(rows).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
