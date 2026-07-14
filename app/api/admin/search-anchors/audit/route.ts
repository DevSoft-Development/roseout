import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { buildSearchAnchorCoverageAudit } from "@/lib/search/anchors/audit";

export const dynamic = "force-dynamic";

const roles = ["superadmin", "admin", "manager"] as const;

export async function GET() {
  const auth = await requireAdminApiRole(roles);
  if (auth.error) return auth.error;

  try {
    const audit = await buildSearchAnchorCoverageAudit