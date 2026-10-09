"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const WRITE_ROLES = ["superadmin", "admin", "experience_team"] as const;
const CATEGORIES = new Set(["search","personalization","sponsorship","business_data","reviews","support_ai","model_provider","other"]);
const SEVERITIES = new Set(["info","warning","error","critical"]);

function value(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

export async function createTrustIncident(formData: FormData) {
  const admin = await requireAdminRole(WRITE_ROLES);
  const category = value(formData, "category", 40);
  const severity = value(formData, "severity", 20);
  const title = value(formData, "title", 180);
  const summary = value(formData, "summary", 3000);
  const requestId = value(formData, "request_id", 180);
  const surface = value(formData, "surface", 120);
  const provider = value(formData, "provider", 120);
  const model = value(formData, "model", 160);

  if (!CATEGORIES.has(category) || !SEVERITIES.has(severity) || title.length < 3) {
    throw new Error("Invalid trust incident.");
  }

  const { error } = await getAdminDatabaseClient().from("trust_incidents").insert({
    category,
    severity,
    status: "open",
    title,
    summary: summary || null,
    request_id: requestId || null,
    surface: surface || null,
    provider: provider || null,
    model: model || null,
    created_by_user_id: admin.user_id,
  });
  if (error) throw error;
  revalidatePath("/admin/dashboard/trust");
}

export async function resolveTrustIncident(formData: FormData) {
  const admin = await requireAdminRole(WRITE_ROLES);
  const id = value(formData, "id", 80);
  if (!id) throw new Error("Incident id is required.");

  const { error } = await getAdminDatabaseClient()
    .from("trust_incidents")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: admin.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/dashboard/trust");
}
