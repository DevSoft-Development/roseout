"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const allowedSeverities = new Set(["low", "medium", "high", "critical"]);
const allowedTypes = new Set([
  "incorrect_explanation",
  "business_fact_error",
  "sponsored_disclosure",
  "personalization",
  "generated_copy",
  "provider_outage",
  "other",
]);

export async function createAiTrustIncident(formData: FormData) {
  const supabaseAdmin = getAdminDatabaseClient();
  const admin = await requireAdminRole(["superadmin", "admin"]);
  const incidentType = String(formData.get("incidentType") || "other");
  const severity = String(formData.get("severity") || "low");
  const summary = String(formData.get("summary") || "").trim().slice(0, 1200);
  const surface = String(formData.get("surface") || "").trim().slice(0, 120) || null;
  const requestId = String(formData.get("requestId") || "").trim().slice(0, 160) || null;
  if (!allowedTypes.has(incidentType)) throw new Error("Invalid incident type.");
  if (!allowedSeverities.has(severity)) throw new Error("Invalid severity.");
  if (!summary) throw new Error("Incident summary is required.");

  const { error } = await supabaseAdmin.from("ai_trust_incidents").insert({
    incident_type: incidentType,
    severity,
    summary,
    surface,
    request_id: requestId,
    created_by_user_id: admin.user_id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/dashboard/ai-trust");
}
