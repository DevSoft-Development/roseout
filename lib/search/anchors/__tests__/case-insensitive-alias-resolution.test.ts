import { describe, expect, it } from "vitest";
import { resolveSearchAnchor } from "../resolve";

function fakeSupabase(rows: any[]) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        ilike: () => builder,
        limit: () => builder,
        then(resolve: (value: any) => void) {
          resolve({ data: table === "search_anchors" ? rows : [] });
        },
      };
      return builder;
    },
  };
}

describe("resolveSearchAnchor alias matching", () => {
  it("matches aliases case-insensitively after normalization", async () => {
    const supabase = fakeSupabase([
      {
        id: "anchor-msg",
        canonical_name: "Madison Square Garden",
        normalized_name: "madison square garden",
        aliases: ["MSG", "The Garden"],
        latitude: 40.7505,
        longitude: -73.9934,
        is_active: true,
        is_searchable: true,
        review_status: "approved",
        default_radius_miles: 1.5,
        max_radius_miles: 3,
      },
    ]);

    const resolution = await resolveSearchAnchor(supabase, "msg");

    expect(resolution.status).toBe("resolved");
    expect(resolution.source).toBe("registry_alias");
    expect(resolution.anchor).toMatchObject({
      id: "anchor-msg",
      canonicalName: "Madison Square Garden",
      aliasMatched: "MSG",
    });
  });

  it("normalizes punctuation and spacing in aliases", async () => {
    const supabase = fakeSupabase([
      {
        id: "anchor-jfk",
        canonical_name: "John F. Kennedy International Airport",
        normalized_name: "john f kennedy international airport",
        aliases: ["J.F.K."],
        latitude: 40.6413,
        longitude: -73.7781,
        is_active: true,
        is_searchable: true,
        review_status: "approved",
      },
    ]);

    const resolution = await resolveSearchAnchor(supabase, "j f k");

    expect(resolution.status).toBe("resolved");
    expect(resolution.source).toBe("registry_alias");
    expect(resolution.anchor?.id).toBe("anchor-jfk");
  });
});
