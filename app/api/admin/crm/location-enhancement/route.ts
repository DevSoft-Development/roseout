import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getEnhancementFieldsForTable,
  inputToTagsArray,
  isArrayEnhancementField,
  isBooleanEnhancementField,
  isEnhancementFieldName,
  isJsonEnhancementField,
  isLocationTableName,
  parseJsonInput,
  type EnhancementFormState,
  type LocationTableName,
} from "@/lib/listing-enhancement";

type RequestBody = { table?: unknown; id?: unknown; updates?: unknown };

type NormalizedUpdate = { ok: true; value: EnhancementFormState[keyof EnhancementFormState] } | { ok: false; error: string };

function normalizeUpdateValue(field: string, value: unknown): NormalizedUpdate {
  if (!isEnhancementFieldName(field)) return { ok: false, error: `Unknown field: ${field}` };
  if (isArrayEnhancementField(field)) {
    if (Array.isArray(value)) return { ok: true, value: inputToTagsArray(value.map((item) => String(item)).join(",")) };
    return { ok: true, value: inputToTagsArray(String(value ?? "")) };
  }
  if (isBooleanEnhancementField(field)) return { ok: true, value: Boolean(value) };
  if (isJsonEnhancementField(field)) {
    if (typeof value === "string") return parseJsonInput(value) as NormalizedUpdate;
    if (value === null || Array.isArray(value) || (typeof value === "object" && value !== null)) return { ok: true, value: value as EnhancementFormState[keyof EnhancementFormState] };
    return { ok: false, error: `${field} must be valid JSON.` };
  }
  const text = String(value ?? "").trim();
  return { ok: true, value: text || null };
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.crmEdit);
  if (auth.error) return auth.error;

  const body = (await request.json()) as RequestBody;
  if (!isLocationTableName(body.table)) return NextResponse.json({ success: false, error: "Unknown location table." }, { status: 400 });

  const table: LocationTableName = body.table;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ success: false, error: "Missing location id." }, { status: 400 });
  if (!body.updates || typeof body.updates !== "object" || Array.isArray(body.updates)) {
    return NextResponse.json({ success: false, error: "Updates must be an object." }, { status: 400 });
  }

  const allowed = new Set(getEnhancementFieldsForTable(table));
  const updates: EnhancementFormState & { updated_at?: string } = {};
  for (const [field, rawValue] of Object.entries(body.updates as Record<string, unknown>)) {
    if (!isEnhancementFieldName(field) || !allowed.has(field)) {
      return NextResponse.json({ success: false, error: `Field ${field} is not allowed for ${table}.` }, { status: 400 });
    }
    const normalized = normalizeUpdateValue(field, rawValue);
    if (!normalized.ok) return NextResponse.json({ success: false, error: normalized.error }, { status: 400 });
    updates[field] = normalized.value;
  }
  updates.updated_at = new Date().toISOString();

  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.from(table).update(updates).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
