import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const FEATURE_FLAG_FIELDS =
  "id,key,name,description,category,enabled,environment,rollout_percentage,created_at,updated_at";

const boundedText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function listFeatureFlags(filters?: { search?: string; filter?: string }) {
  const adminDb = getAdminDatabaseClient();
  let query = adminDb
    .from("feature_flags")
    .select(FEATURE_FLAG_FIELDS)
    .order("updated_at", { ascending: false });

  const search = boundedText(filters?.search, 120);
  const filter = boundedText(filters?.filter, 40);

  if (filter === "enabled") query = query.eq("enabled", true);
  if (filter === "disabled") query = query.eq("enabled", false);
  if (filter === "production") query = query.eq("environment", "production");
  if (filter === "experimental") query = query.eq("category", "experimental");

  if (search) {
    query = query.or(
      `key.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`,
    );
  }

  const { data, error } = await query.limit(200);
  return { flags: data || [], error: error?.message || null };
}

export async function createFeatureFlag(body: Record<string, unknown>) {
  const adminDb = getAdminDatabaseClient();
  const key = boundedText(body.key, 120);
  const name = boundedText(body.name, 160);

  if (!key || !name) {
    return { flag: null, error: "key and name required", status: 400 };
  }

  const rollout = Math.max(0, Math.min(100, Number(body.rollout_percentage ?? 100)));
  const payload = {
    key,
    name,
    description: boundedText(body.description, 2000) || null,
    category: boundedText(body.category, 80) || null,
    enabled: Boolean(body.enabled),
    environment: boundedText(body.environment, 40) || "production",
    rollout_percentage: Number.isFinite(rollout) ? rollout : 100,
  };

  const { data, error } = await adminDb
    .from("feature_flags")
    .insert(payload)
    .select(FEATURE_FLAG_FIELDS)
    .single();

  if (error) return { flag: null, error: error.message, status: 500 };
  return { flag: data, error: null, status: 201 };
}
