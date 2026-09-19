import { NextResponse } from "next/server";
import { getLocationName } from "@/lib/locationName";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

function escapeSearch(value: string) {
  return value.replace(/[%_,]/g, "");
}

export async function GET(req: Request) {
  try {
    const { error: authError, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.dashboard);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get("q") || "";
    const q = escapeSearch(rawQuery.trim());

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const { data: users } = await supabase
      .from("users")
      .select("id,email,full_name,phone,role,subscription_status")
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);

    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id,name,restaurant_name,city,state,owner_email,address,owner_user_id")
      .or(
        `restaurant_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,owner_email.ilike.%${q}%,address.ilike.%${q}%`
      )
      .limit(8);

    const { data: activities } = await supabase
      .from("activities")
      .select("id,name,activity_name,city,state,owner_email,address,owner_user_id")
      .or(
        `activity_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,owner_email.ilike.%${q}%,address.ilike.%${q}%`
      )
      .limit(8);

    const results = [
      ...(users || []).map((u: any) => ({
        type: "user",
        id: u.id,
        title: u.full_name || "Unnamed User",
        subtitle: u.email || "No email",
        meta: u.role || "user",
        phone: u.phone || null,
        subscription_status: u.subscription_status || null,
      })),

      ...(restaurants || []).map((r: any) => ({
        type: "location",
        locationType: "restaurants",
        id: r.id,
        title: getLocationName(r, "Untitled restaurant"),
        subtitle:
          [r.city, r.state].filter(Boolean).join(", ") ||
          r.address ||
          "Restaurant",
        meta: r.owner_email || "No owner email",
        ownerUserId: r.owner_user_id || null,
      })),

      ...(activities || []).map((a: any) => ({
        type: "location",
        locationType: "activities",
        id: a.id,
        title: getLocationName(a, "Untitled activity"),
        subtitle:
          [a.city, a.state].filter(Boolean).join(", ") ||
          a.address ||
          "Activity",
        meta: a.owner_email || "No owner email",
        ownerUserId: a.owner_user_id || null,
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Admin global search error:", error);

    return NextResponse.json(
      {
        error: "Failed to search users and locations",
        results: [],
      },
      { status: 500 }
    );
  }
}
