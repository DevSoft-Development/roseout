import { NextRequest, NextResponse } from "next/server";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { hasLocationImage } from "@/lib/locationImage";

function cleanParam(value: string | null) { return (value ?? "").trim(); }
function normalizeKind(value: string | null) { const v=cleanParam(value).toLowerCase(); if (["restaurants","restaurant","food","brunch"].includes(v)) return "restaurants"; if (["activities","activity","things","things-to-do"].includes(v)) return "activities"; if (["rooftops","rooftop"].includes(v)) return "rooftops"; if (["lounges","lounge"].includes(v)) return "lounges"; return "all"; }
function normalizeArea(value: string | null) { return cleanParam(value) || "all"; }
function buildExploreQuery(q: string, kind: string, area: string) { const parts=[q]; if (!q && kind==="restaurants") parts.push("restaurants"); if (!q && kind==="activities") parts.push("things to do"); if (kind==="rooftops") parts.push("rooftop lounge"); if (kind==="lounges") parts.push("lounge nightlife"); if (area!=="all") parts.push(`in ${area}`); return parts.filter(Boolean).join(" ").trim() || "things to do"; }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanParam(params.get("q"));
  const kind = normalizeKind(params.get("kind"));
  const area = normalizeArea(params.get("area"));
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const perPage = Math.min(96, Math.max(12, Number(params.get("limit") ?? 96) || 96));
  try {
    const query = buildExploreQuery(q, kind, area);
    const simple = Boolean(!q || /^[\w\s-]+$/.test(q));
    const result = await runEnterpriseSearch(query, { useLLM: !simple && q.split(/\s+/).length > 3, displayLimit: 48 });
    const mixedWithPairing = result.render_mode === "mixed_pairs" || result.render_mode === "partial_mixed";
    let exploreNote: string | undefined;
    let items = kind === "restaurants" || kind === "rooftops" ? result.restaurants : kind === "activities" || kind === "lounges" ? result.activities : mixedWithPairing && result.pairs.length ? [...result.pairs, ...result.restaurants, ...result.activities] : [...result.restaurants, ...result.activities];
    items = items.filter((item: any) => {
      if (item?.restaurant || item?.activity) {
        return hasLocationImage(item.restaurant) && hasLocationImage(item.activity);
      }

      return hasLocationImage(item);
    });
    if (kind === "all" && mixedWithPairing && !result.pairs.length) exploreNote = "No walkable pairs found. Showing individual matches. Prefer using /create for full pair planning.";
    if (kind === "rooftops") items = items.filter((item:any)=>/[\s-]roof|rooftop|terrace|skyline|view|lounge/i.test([item.name,item.primary_category,item.description,item.search_document,item.tags].flat().join(" ")));
    if (kind === "lounges") items = items.filter((item:any)=>/lounge|hookah|bar|nightlife|cocktail/i.test([item.name,item.primary_category,item.activity_type,item.description,item.search_document,item.tags].flat().join(" ")));
    const total = items.length;
    const start = (page - 1) * perPage;
    items = items.slice(start, start + perPage);
    return NextResponse.json({ success: true, items, restaurants: result.restaurants, activities: result.activities, pairs: result.pairs, note: exploreNote, total, debug: process.env.NODE_ENV !== "production" ? result.debug : undefined });
  } catch (error) {
    console.error("EXPLORE_SEARCH_ERROR", error);
    return NextResponse.json({ success: false, items: [], restaurants: [], activities: [], total: 0, error: error instanceof Error ? error.message : "Explore search failed" }, { status: 200 });
  }
}
