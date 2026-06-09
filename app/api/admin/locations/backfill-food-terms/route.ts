import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildFoodTermUpdate,
  cleanTerms,
  type LocationFoodTermPatch,
} from "@/lib/search/enterprise/location-food-terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LocationType = "restaurant" | "activity" | "all";

type BackfillBody = {
  dryRun?: boolean;
  limit?: number | string;
  locationType?: LocationType;
  ids?: string[];
};

type TargetTable = "locations" | "restaurants" | "activities";

type BackfillPreviewItem = {
  table: TargetTable;
  id: string;
  name: string | null;
  existingSearchKeywords: string[];
  addedSearchKeywords: string[];
  addedSemanticTags: string[];
  addedIntentTags: string[];
  newSearchDocumentPreview: string;
};

const DESIRED_COLUMNS = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "address",
  "city",
  "neighborhood",
  "borough",
  "cuisine",
  "cuisine_type",
  "primary_category",
  "description",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "date_style_tags",
  "search_keywords",
  "semantic_tags",
  "intent_tags",
  "search_document",
  "semantic_search_text",
  "location_type",
  "source_table",
  "deleted_at",
  "created_at",
] as const;

const REQUIRED_COLUMNS = ["id"] as const;

function parseLocationType(value: unknown): LocationType {
  return value === "restaurant" || value === "activity" || value === "all"
    ? value
    : "all";
}

function parseLimit(value: unknown) {
  return Math.max(1, Math.min(Number(value || 100), 1000));
}

function cleanIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean)
    .slice(0, 1000);
}

function getLocationName(row: any) {
  return row.name || row.restaurant_name || row.activity_name || null;
}

async function getAvailableColumns(table: TargetTable) {
  const all = [...DESIRED_COLUMNS];
  const fullProbe = await supabaseAdmin
    .from(table)
    .select(all.join(", "))
    .limit(1);

  if (!fullProbe.error) return new Set(all);

  const available = new Set<string>();

  for (const column of all) {
    const { error } = await supabaseAdmin.from(table).select(column).limit(1);
    if (!error) available.add(column);
  }

  for (const column of REQUIRED_COLUMNS) {
    if (!available.has(column)) {
      throw new Error(`Required column ${table}.${column} is unavailable`);
    }
  }

  return available;
}

function targetTables(locationType: LocationType): TargetTable[] {
  if (locationType === "restaurant") return ["locations", "restaurants"];
  if (locationType === "activity") return ["locations", "activities"];
  return ["locations", "restaurants", "activities"];
}

function applyTypeFilter(query: any, table: TargetTable, locationType: LocationType, columns: Set<string>) {
  if (table !== "locations" || locationType === "all") return query;

  if (locationType === "restaurant") {
    const filters = [];
    if (columns.has("location_type")) filters.push("location_type.eq.restaurant");
    if (columns.has("source_table")) filters.push("source_table.eq.restaurants", "source_table.eq.restaurant");
    if (columns.has("restaurant_name")) filters.push("restaurant_name.not.is.null");
    return filters.length ? query.or(filters.join(",")) : query;
  }

  const filters = [];
  if (columns.has("location_type")) filters.push("location_type.eq.activity");
  if (columns.has("source_table")) filters.push("source_table.eq.activities", "source_table.eq.activity");
  if (columns.has("activity_name")) filters.push("activity_name.not.is.null");
  return filters.length ? query.or(filters.join(",")) : query;
}

async function fetchRows({
  table,
  columns,
  locationType,
  ids,
  limit,
}: {
  table: TargetTable;
  columns: Set<string>;
  locationType: LocationType;
  ids: string[];
  limit: number;
}) {
  let query = supabaseAdmin
    .from(table)
    .select(Array.from(columns).join(", "))
    .limit(limit);

  if (ids.length) query = query.in("id", ids);
  if (columns.has("deleted_at")) query = query.is("deleted_at", null);
  query = applyTypeFilter(query, table, locationType, columns);
  if (columns.has("created_at")) query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

function topAddedTerms(preview: BackfillPreviewItem[]) {
  const counts = new Map<string, number>();
  for (const item of preview) {
    for (const term of [
      ...item.addedSearchKeywords,
      ...item.addedSemanticTags,
      ...item.addedIntentTags,
    ]) {
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return Array.from(counts, ([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 25);
}

function hasPatchTerms(patch: LocationFoodTermPatch) {
  return (
    patch.searchKeywords.length > 0 ||
    patch.semanticTags.length > 1 ||
    patch.intentTags.length > 0
  );
}

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dataQuality);
  if (error) return error;

  try {
    const body = (await request.json().catch(() => ({}))) as BackfillBody;
    const dryRun = body.dryRun !== false;
    const limit = parseLimit(body.limit);
    const locationType = parseLocationType(body.locationType);
    const ids = cleanIds(body.ids);

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const preview: BackfillPreviewItem[] = [];

    for (const table of targetTables(locationType)) {
      if (scanned >= limit && !ids.length) break;

      let columns: Set<string>;
      try {
        columns = await getAvailableColumns(table);
      } catch (columnError) {
        errors.push(columnError instanceof Error ? columnError.message : String(columnError));
        continue;
      }

      const remaining = ids.length ? limit : limit - scanned;
      let rows: any[] = [];
      try {
        rows = await fetchRows({ table, columns, locationType, ids, limit: remaining });
      } catch (fetchError) {
        errors.push(fetchError instanceof Error ? fetchError.message : String(fetchError));
        continue;
      }

      for (const row of rows) {
        scanned++;
        const result = buildFoodTermUpdate(row, columns);

        if (!hasPatchTerms(result.patch) || !result.changed || Object.keys(result.update).length === 0) {
          skipped++;
          continue;
        }

        const previewItem: BackfillPreviewItem = {
          table,
          id: row.id,
          name: getLocationName(row),
          existingSearchKeywords: cleanTerms(
            Array.isArray(row.search_keywords) ? row.search_keywords : [],
          ),
          addedSearchKeywords: result.addedSearchKeywords,
          addedSemanticTags: result.addedSemanticTags,
          addedIntentTags: result.addedIntentTags,
          newSearchDocumentPreview: result.newSearchDocumentPreview,
        };
        preview.push(previewItem);

        if (dryRun) {
          updated++;
          continue;
        }

        const { error: updateError } = await supabaseAdmin
          .from(table)
          .update(result.update)
          .eq("id", row.id);

        if (updateError) {
          skipped++;
          errors.push(`${table}.${row.id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned,
      updated,
      skipped,
      preview: preview.slice(0, 100),
      topAddedTerms: topAddedTerms(preview),
      errors,
    });
  } catch (backfillError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          backfillError instanceof Error
            ? backfillError.message
            : "Food term backfill failed",
      },
      { status: 500 },
    );
  }
}
