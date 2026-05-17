import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeString, requireMarketingAdminApi, requireMarketingViewerApi } from "@/lib/marketing-admin";

export const dynamic = "force-dynamic";

type SettingsPayload = Record<string, unknown>;

function normalizeSettingsPayload(body: unknown): { key: string; value: unknown }[] {
  if (!body || typeof body !== "object") return [];
  const source = "settings" in body && body.settings && typeof body.settings === "object" ? body.settings as SettingsPayload : body as SettingsPayload;

  return Object.entries(source)
    .map(([key, value]) => ({ key: normalizeString(key), value: value ?? {} }))
    .filter((entry) => entry.key);
}

export async function GET() {
  const { error } = await requireMarketingViewerApi();
  if (error) return error;

  const { data, error: fetchError } = await supabaseAdmin
    .from("marketing_settings")
    .select("key,value,created_at,updated_at")
    .order("key", { ascending: true });

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
  return NextResponse.json({ settings, rows: data || [] });
}

async function upsertSettings(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const entries = normalizeSettingsPayload(body);
  if (!entries.length) return NextResponse.json({ error: "No settings provided." }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error: upsertError } = await supabaseAdmin
    .from("marketing_settings")
    .upsert(entries.map((entry) => ({ ...entry, updated_at: now })), { onConflict: "key" })
    .select("key,value,created_at,updated_at");

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
  return NextResponse.json({ settings, rows: data || [] });
}

export async function POST(req: Request) {
  return upsertSettings(req);
}

export async function PATCH(req: Request) {
  return upsertSettings(req);
}
