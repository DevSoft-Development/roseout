import { NextResponse } from "next/server";
import { getLocationName } from "@/lib/locationName";
import { createClient } from "@supabase/supabase-js";
import { LOCATION_SCORE_SELECT_FIELDS } from "@/lib/locationScore";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function escapeSearch(value: string) {
  return value.replace(/[%_,]/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get("q") || "";
    const q = escapeSearch(rawQuery.trim());

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const supabase = adminSupabase();

    const { data: users } = await supabase
      .from("users")
      .select("id,email,full_name,phone,role,subscription_status")
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);

    const { data: restaurants } = await supabase
      .from("restaurants")
      .select(`id,name,restaurant_name,city,state,owner_email,address,${LOCATION_SCORE_SELECT_FIELDS}`)
      .or(
        `restaurant_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,owner_email.ilike.%${q}%,address.ilike.%${q}%`
      )
      .limit(8);

    const { data: activities } = await supabase
      .from("activities")
      .select(`id,name,activity_name,city,state,owner_email,address,${LOCATION_SCORE_SELECT_FIELDS}`)
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