import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isThreeCxAuthorized,
  normalizePhone,
  phoneLookupSuffix,
  splitContactName,
} from "@/lib/integrations/three-cx";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isThreeCxAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawPhone = request.nextUrl.searchParams.get("phone") || request.nextUrl.searchParams.get("number") || "";
  const normalized = normalizePhone(rawPhone);
  if (normalized.length < 7) {
    return NextResponse.json({ contacts: [] });
  }

  const suffix = phoneLookupSuffix(normalized);
  const { data, error } = await supabaseAdmin
    .from("admin_crm_locations_view")
    .select("id,name,location_name,phone,owner_email,city,state")
    .ilike("phone", `%${suffix}`)
    .limit(50);

  if (error) {
    console.error("three_cx_lookup_failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "CRM lookup failed." }, { status: 500 });
  }

  const matches = (data || []).filter((row: any) => normalizePhone(row.phone) === normalized);
  const contacts = matches.map((row: any) => {
    const company = String(row.location_name || row.name || "TheOutHaven location");
    const { firstName, lastName } = splitContactName(company);
    return {
      id: String(row.id),
      firstName,
      lastName,
      company,
      email: row.owner_email || "",
      businessPhone: row.phone || rawPhone,
      city: row.city || "",
      state: row.state || "",
      profileUrl: `https://www.theouthaven.com/admin/dashboard/crm/${row.id}?tab=communication`,
    };
  });

  return NextResponse.json({ contacts });
}
