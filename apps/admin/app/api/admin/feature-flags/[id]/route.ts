import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const FEATURE_FLAG_FIELDS = "id,key,name,description,category,enabled,environment,rollout_percentage,created_at,updated_at";
const boundedText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.featureFlags);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in body) updates.name = boundedText(body.name, 160) || null;
  if ("description" in body) updates.description = boundedText(body.description, 2000) || null;
  if ("category" in body) updates.category = boundedText(body.category, 80) || null;
  if ("environment" in body) updates.environment = boundedText(body.environment, 40) || null;
  if ("rollout_percentage" in body) {
    const rollout = Number(body.rollout_percentage);
    if (!Number.isFinite(rollout)) return NextResponse.json({ error: "rollout_percentage must be numeric." }, { status: 400 });
    updates.rollout_percentage = Math.max(0, Math.min(100, rollout));
  }

  const { data, error } = await supabaseAdmin.from("feature_flags").update(updates).eq("id", id).select(FEATURE_FLAG_FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flag: data });
}
