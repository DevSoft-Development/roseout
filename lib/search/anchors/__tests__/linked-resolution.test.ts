import { describe, expect, it } from "vitest";
import { resolveSearchAnchor } from "../resolve";
import { auditLinkedAnchorDrift, detectAliasCollisions } from "../drift";
import { syncApprovedLocationsToSearchAnchors } from "../sync";

function db(seed: { anchors?: any[]; locations?: any[] }) {
  const tables: any = { search_anchors: [...(seed.anchors || [])], locations: [...(seed.locations || [])], search_anchor_discoveries: [] };
  const api = (table: string) => {
    let rows = tables[table];
    const chain: any = {
      select: () => chain,
      eq: (k: string, v: any) => { rows = rows.filter((r: any) => r[k] === v); return chain; },
      not: (k: string, op: string, v: any) => { rows = rows.filter((r: any) => op === "is" ? r[k] !== v : r[k] != null); return chain; },
      is: (k: string, v: any) => { rows = rows.filter((r: any) => r[k] === v); return chain; },
      in: (k: string, v: any[]) => { rows = rows.filter((r: any) => v.includes(r[k])); return chain; },
      limit: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      or: (expr: string) => { const m = expr.match(/normalized_name\.eq\.([^,]+)/); if (m) rows = rows.filter((r: any) => r.normalized_name === m[1] || (r.aliases || []).includes("Gaming City")); return chain; },
      ilike: (k: string, pat: string) => { const needle = pat.replaceAll("%", "").toLowerCase(); rows = rows.filter((r: any) => String(r[k] || "").toLowerCase().includes(needle)); return chain; },
      insert: (row: any) => { tables[table].push({ ...row, id: row.id || `a${tables[table].length + 1}` }); return Promise.resolve({ data: row, error: null }); },
      update: (patch: any) => ({ eq: (k: string, v: any) => { tables[table] = tables[table].map((r: any) => r[k] === v ? { ...r, ...patch } : r); return Promise.resolve({ data: null, error: null }); } }),
    };
    return chain;
  };
  return { from: api, tables };
}

const gaming = { id: "loc-gaming", name: "Gaming City", is_searchable: true, is_hidden: false, deleted_at: null, latitude: 40.76, longitude: -73.92, city: "New York", borough: "Queens", market: "NYC_CORE", location_type: "arcade", activity_name: "Gaming City", quality_status: "publish_ready" };
const seafood = { id: "loc-seafood", name: "Astoria Seafood", restaurant_name: "Astoria Seafood", is_searchable: true, is_hidden: false, deleted_at: null, latitude: 40.762, longitude: -73.923, city: "New York", borough: "Queens", market: "NYC_CORE", location_type: "restaurant", quality_status: "publish_ready" };

function linkedAnchor(loc: any = gaming) { return { id: "anc-gaming", canonical_name: loc.name, normalized_name: loc.name.toLowerCase(), aliases: [], anchor_type: "activity", source_type: "linked_location", linked_location_id: loc.id, is_active: true, is_searchable: true, review_status: "approved", latitude: loc.latitude, longitude: loc.longitude, default_radius_miles: 1.5, max_radius_miles: 3, radius_strategy: "dense_urban" }; }

describe("linked anchor resolution", () => {
  it.each([
    ["Gaming City", "registry_exact", "activity"],
    ["Astoria Seafood", "location_exact", "restaurant"],
  ])("resolves %s with the unified anchor shape", async (name, source, type) => {
    const supabase = db({ anchors: name === "Gaming City" ? [linkedAnchor()] : [], locations: [gaming, seafood] });
    const result = await resolveSearchAnchor(supabase, name, "Queens");
    expect(result.status).toBe("resolved");
    expect(result.source).toBe(source);
    expect(result.anchor).toMatchObject({ canonicalName: name, anchorType: type, latitude: expect.any(Number), longitude: expect.any(Number) });
  });

  it("falls back directly to approved locations when the registry row is missing", async () => {
    const result = await resolveSearchAnchor(db({ locations: [gaming] }), "Gaming City", "Astoria");
    expect(result.source).toBe("location_exact");
    expect(result.anchor?.syncStatus).toBe("missing_registry_anchor");
  });
});

describe("location anchor sync", () => {
  it("creates anchors, preserves aliases/radius overrides, and disables ineligible sources", async () => {
    const hidden = { ...seafood, id: "hidden", is_hidden: true };
    const existing = { ...linkedAnchor(gaming), id: "anc-gaming", canonical_name: "Old Gaming City", aliases: ["Gaming City Arcade"], manual_override_fields: ["radius"], default_radius_miles: 9, max_radius_miles: 10, metadata: { manual_aliases: ["Gaming City Arcade"] } };
    const supabase = db({ anchors: [existing, { ...linkedAnchor(hidden), id: "anc-hidden", linked_location_id: "hidden" }], locations: [gaming, hidden] });
    const result = await syncApprovedLocationsToSearchAnchors(supabase);
    expect(result.updated).toBe(1);
    expect(result.disabled).toBe(1);
    const updated = supabase.tables.search_anchors.find((a: any) => a.id === "anc-gaming");
    expect(updated.aliases).toContain("gaming city arcade");
    expect(updated.default_radius_miles).toBe(9);
    expect(updated.metadata.generated_aliases).toContain("old gaming city");
  });
});

describe("linked anchor drift", () => {
  it("detects alias collisions", () => {
    expect(detectAliasCollisions([{ id: "a", canonical_name: "A", aliases: ["Same"], is_active: true, is_searchable: true }, { id: "b", canonical_name: "B", aliases: ["Same"], is_active: true, is_searchable: true }])[0].type).toBe("duplicate_alias");
  });

  it("detects inactive source and missing registry row", async () => {
    const supabase = db({ anchors: [linkedAnchor({ ...gaming, latitude: 1, longitude: 1 })], locations: [{ ...gaming, is_hidden: true }, seafood] });
    const audit = await auditLinkedAnchorDrift(supabase);
    expect(audit.issues.map((i) => i.type)).toContain("active_anchor_with_inactive_source_location");
    expect(audit.issues.map((i) => i.type)).toContain("linked_anchor_missing_registry_row");
  });
});
