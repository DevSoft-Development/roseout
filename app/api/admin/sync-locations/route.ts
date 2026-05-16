import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ACTIVITY_LOCATION_SELECT,
  RESTAURANT_LOCATION_SELECT,
  syncSourceRowToLocation,
} from "@/lib/sync-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SourceTable = "restaurants" | "activities";
type TableParam = SourceTable | "both";
type SourceRow = Record<string, unknown> & { id: string | number };

type TableSyncResult = {
  checked: number;
  synced: number;
  clean: number;
  needsReview: number;
  nextOffset: number | null;
  errors: Array<{ id: SourceRow["id"]; message: string }>;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

const EMPTY_RESULT: TableSyncResult = {
  checked: 0,
  synced: 0,
  clean: 0,
  needsReview: 0,
  nextOffset: null,
  errors: [],
};

function parseBatchParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function isValidTableParam(table: string): table is TableParam {
  return table === "restaurants" || table === "activities" || table === "both";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getMissingColumn(errorMessage: string) {
  return (
    errorMessage.match(/'([^']+)' column/)?.[1] ||
    errorMessage.match(/column "([^".]+)"/)?.[1] ||
    errorMessage.match(/column [^.]+\.([a-zA-Z0-9_]+) does not exist/)?.[1] ||
    errorMessage.match(/Could not find the '([^']+)' column/)?.[1] ||
    null
  );
}

function removeColumnFromSelect(select: string, column: string) {
  return select
    .split("\n")
    .filter((line) => line.trim().replace(/,$/, "") !== column)
    .join("\n");
}

async function selectSourceRows(
  table: SourceTable,
  select: string,
  limit: number,
  offset: number,
) {
  let safeSelect = select;

  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(safeSelect)
      .range(offset, offset + limit - 1);

    if (!error) return (data || []) as unknown as SourceRow[];

    const missingColumn = getMissingColumn(error.message);

    if (missingColumn && safeSelect.includes(missingColumn)) {
      safeSelect = removeColumnFromSelect(safeSelect, missingColumn);
      continue;
    }

    throw error;
  }

  throw new Error("Unable to select source rows after removing unsupported columns");
}

async function syncTable(
  table: SourceTable,
  limit: number,
  offset: number,
): Promise<TableSyncResult> {
  const select =
    table === "restaurants" ? RESTAURANT_LOCATION_SELECT : ACTIVITY_LOCATION_SELECT;
  const rows = await selectSourceRows(table, select, limit, offset);
  const result: TableSyncResult = {
    checked: rows.length,
    synced: 0,
    clean: 0,
    needsReview: 0,
    nextOffset: rows.length < limit ? null : offset + limit,
    errors: [],
  };

  for (const row of rows) {
    try {
      const payload = await syncSourceRowToLocation(table, row);
      result.synced += 1;

      if (payload.is_searchable) {
        result.clean += 1;
      } else {
        result.needsReview += 1;
      }
    } catch (error) {
      console.error("sync-locations upsert error", table, row.id, error);
      result.errors.push({ id: row.id, message: getErrorMessage(error) });
    }
  }

  return result;
}

async function runSync(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tableParam = url.searchParams.get("table") || "both";
    const requestedLimit = parseBatchParam(
      url.searchParams.get("limit"),
      DEFAULT_LIMIT,
    );
    const offset = parseBatchParam(url.searchParams.get("offset"), 0);

    if (!isValidTableParam(tableParam)) {
      return NextResponse.json(
        { success: false, error: "table must be restaurants, activities, or both" },
        { status: 400 },
      );
    }

    const limit = Math.max(1, Math.min(requestedLimit, MAX_LIMIT));
    const restaurants =
      tableParam === "activities"
        ? EMPTY_RESULT
        : await syncTable("restaurants", limit, offset);
    const activities =
      tableParam === "restaurants"
        ? EMPTY_RESULT
        : await syncTable("activities", limit, offset);

    const errors = [...restaurants.errors, ...activities.errors];
    const checked = restaurants.checked + activities.checked;
    const synced = restaurants.synced + activities.synced;
    const clean = restaurants.clean + activities.clean;
    const needsReview = restaurants.needsReview + activities.needsReview;

    return NextResponse.json({
      success: errors.length === 0,
      checked,
      synced,
      clean,
      needsReview,
      errors,
      restaurants,
      activities,
      settings: {
        table: tableParam,
        limit,
        offset,
        nextOffset: {
          restaurants: restaurants.nextOffset,
          activities: activities.nextOffset,
        },
      },
    });
  } catch (error) {
    console.error("sync-locations error:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}
