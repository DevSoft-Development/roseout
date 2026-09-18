import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const betaAdminRoles = ["superadmin", "admin", "experience_team"] as const;

export async function requireBetaAdmin() {
  const adminUser = await requireAdminRole(betaAdminRoles);
  return { adminUser, error: null as null };
}

export function safeError(message = "Request failed", status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function listTable(table: string, limit = 200) {
  const { data, error } = await getAdminDatabaseClient()
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
