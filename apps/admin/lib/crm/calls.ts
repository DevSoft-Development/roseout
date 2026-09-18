import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type CallsRow = {
  id: string;
  name: string;
  location_name: string;
  phone: string;
  city: string;
  state: string;
  market: string;
  region: string;
  crm_status: string;
};

function broadAccess(role: string, profile: any) {
  return ["superadmin", "admin", "manager"].includes(String(role || "").toLowerCase())
    || ["superadmin", "admin", "manager"].includes(String(profile?.team_type || "").toLowerCase());
}

async function permittedLocationIds(userId: string, role: string) {
  const db = getAdminDatabaseClient();
  const { data: profile, error } = await db
    .from("team_member_profiles")
    .select("id,team_type,assigned_location_ids")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (broadAccess(role, profile)) return null;

  const direct = Array.isArray(profile?.assigned_location_ids)
    ? profile.assigned_location_ids.map((value: unknown) => String(value || "").trim()).filter(Boolean)
    : [];
  if (direct.length) return direct;
  if (!profile?.id) return [];

  const { data: assignments, error: assignmentError } = await db
    .from("team_location_assignments")
    .select("location_id")
    .eq("team_member_id", profile.id)
    .eq("status", "active")
    .limit(2000);
  if (assignmentError) throw assignmentError;
  return (assignments || []).map((row: any) => String(row.location_id || "")).filter(Boolean);
}

function displayName(row: any) {
  return String(row.location_name || row.name || row.restaurant_name || row.activity_name || "Untitled location");
}

function displayPhone(row: any) {
  return String(row.phone || row.phone_number || row.contact_phone || "").trim();
}

function displayStatus(row: any) {
  const raw = String(row.crm_status || row.claim_status || "").trim();
  if (raw) return raw.replaceAll("_", " ");
  return row.is_claimed ? "claimed" : "needs outreach";
}

function matches(row: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    displayName(row),
    displayPhone(row),
    row.city,
    row.state,
    row.owner_email,
    row.address,
  ].filter(Boolean).join(" ").toLowerCase().includes(q);
}

export async function listCallableCrmLocations(input: {
  userId: string;
  role: string;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getAdminDatabaseClient();
  const allowed = await permittedLocationIds(input.userId, input.role);
  if (Array.isArray(allowed) && allowed.length === 0) {
    return { rows: [] as CallsRow[], total: 0, page: 1, pageSize: input.pageSize || 50 };
  }

  let query = db.from("locations").select("*").order("name", { ascending: true }).limit(5000);
  if (Array.isArray(allowed)) query = query.in("id", allowed);
  const { data, error } = await query;
  if (error) throw error;

  const filtered = (data || []).filter((row: any) => matches(row, input.query || "") && Boolean(displayPhone(row)));
  const pageSize = Math.min(Math.max(Number(input.pageSize || 50), 1), 100);
  const page = Math.max(Number(input.page || 1), 1);
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize).map((row: any) => ({
    id: String(row.id),
    name: displayName(row),
    location_name: displayName(row),
    phone: displayPhone(row),
    city: String(row.city || ""),
    state: String(row.state || ""),
    market: String(row.market || ""),
    region: String(row.region || ""),
    crm_status: displayStatus(row),
  }));

  return { rows, total: filtered.length, page, pageSize };
}

export async function getCrmCallRecord(id: string) {
  const db = getAdminDatabaseClient();
  const [{ data: location, error: locationError }, { data: activities, error: activityError }] = await Promise.all([
    db.from("locations").select("*").eq("id", id).maybeSingle(),
    db.from("crm_activities")
      .select("id,summary,activity_type,source_system,created_at")
      .eq("location_id", id)
      .eq("source_system", "3cx")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (locationError) throw locationError;
  if (activityError) throw activityError;
  return { location, activities: activities || [] };
}
