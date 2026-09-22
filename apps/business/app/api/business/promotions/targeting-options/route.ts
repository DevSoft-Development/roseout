import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueSorted(values: unknown[]) {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = text(searchParams.get("locationId") || searchParams.get("location_id"));
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: postalRows, error: postalError }, { data: territories, error: territoryError }, { data: scopes }] = await Promise.all([
    supabaseAdmin
      .from("geo_postal_areas")
      .select("zip_code,primary_neighborhood,borough,city,county,state,market")
      .eq("is_active", true)
      .order("zip_code", { ascending: true })
      .limit(5000),
    supabaseAdmin
      .from("crm_territories")
      .select("id,name,status")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(500),
    supabaseAdmin
      .from("crm_territory_scopes")
      .select("territory_id,scope_type,scope_value")
      .limit(10000),
  ]);

  if (postalError) return NextResponse.json({ error: postalError.message }, { status: 500 });
  if (territoryError) return NextResponse.json({ error: territoryError.message }, { status: 500 });

  const rows = postalRows || [];
  const scopesByTerritory = new Map<string, Array<{ type: string; value: string }>>();
  for (const scope of scopes || []) {
    const id = text(scope.territory_id);
    if (!id) continue;
    const current = scopesByTerritory.get(id) || [];
    current.push({ type: text(scope.scope_type), value: text(scope.scope_value) });
    scopesByTerritory.set(id, current);
  }

  return NextResponse.json({
    options: {
      markets: uniqueSorted(rows.map((row: any) => row.market)),
      states: uniqueSorted(rows.map((row: any) => row.state)),
      counties: uniqueSorted(rows.map((row: any) => row.county)),
      cities: uniqueSorted(rows.map((row: any) => row.city)),
      boroughs: uniqueSorted(rows.map((row: any) => row.borough)),
      neighborhoods: uniqueSorted(rows.map((row: any) => row.primary_neighborhood)),
      zipCodes: uniqueSorted(rows.map((row: any) => row.zip_code)),
      territories: (territories || []).map((territory: any) => ({
        id: String(territory.id),
        name: territory.name || "Territory",
        scopes: scopesByTerritory.get(String(territory.id)) || [],
      })),
    },
    location: {
      id: String(access.location.id),
      zipCode: access.location.zip_code || access.location.postal_code || null,
      market: access.location.market || null,
      borough: access.location.borough || null,
      neighborhood: access.location.neighborhood || null,
    },
  });
}
