import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const confirmation = "superiority-burger-119-avenue-a";
/** Fail-closed, bounded, read-only preflight; no publishing or provider spend. */
export async function POST(request: Request) {
  await requireAdminRole(["superadmin"]);
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-admin" ||
      process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED !== "true")
    return NextResponse.json({ ok: false, error: "preflight_not_authorized" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== confirmation || body?.preflight !== true)
    return NextResponse.json({ ok: false, error: "exact_confirmation_required" }, { status: 400 });
  const db = getAdminDatabaseClient();
  const [byName, byAddress, staging, batches] = await Promise.all([
    db.from("locations").select("id,name,address,city,state,is_searchable,import_source")
      .ilike("name", "%superiority%burger%").limit(20),
    db.from("locations").select("id,name,address,city,state,is_searchable,import_source")
      .ilike("address", "%119%avenue%a%").limit(50),
    db.from("location_import_staging").select("id,name,address,city,state,import_status")
      .ilike("name", "%superiority%burger%").limit(20),
    db.from("location_import_batches").select("id,status,source,metadata")
      .eq("source", "li_v2_independent").limit(50),
  ]);
  if (byName.error || byAddress.error || staging.error || batches.error)
    return NextResponse.json({ ok: false, error: "dedupe_inventory_unavailable" }, { status: 503 });
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidate = [...(byName.data ?? []), ...(byAddress.data ?? [])];
  const sameStreet = candidate.filter(row =>
    norm(row.address) === "119avenuea" && norm(row.city) === "newyork" &&
    ["ny", "newyork"].includes(norm(row.state)));
  const sameName = candidate.filter(row => norm(row.name) === "superiorityburger");
  const duplicates = [...new Map([...sameStreet, ...sameName].map(row => [String(row.id), row])).values()];
  const pending = (staging.data ?? []).filter(row => norm(row.name) === "superiorityburger");
  const existingBatch = (batches.data ?? []).filter(row =>
    JSON.stringify(row.metadata ?? {}).includes("li-v2-bootstrap-superiority"));
  const blocked = duplicates.length > 0 || pending.length > 0 || existingBatch.length > 0;
  return NextResponse.json({
    ok: !blocked, preflight: true, importExecuted: false, writes: 0, paidRequests: 0,
    oneLocationLimit: 1, candidate: { name: "Superiority Burger", address: "119 Avenue A", city: "New York", state: "NY" },
    duplicateCount: duplicates.length, duplicateLocationIds: duplicates.map(row => row.id),
    stagingCount: pending.length, batchCount: existingBatch.length,
    publicationAuthorized: false, searchV3RetrievalCertified: false,
    nextGate: blocked ? "resolve_existing_identity_or_staging" : "protected_pipeline_integration_required",
  }, { status: blocked ? 409 : 200 });
}
