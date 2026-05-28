import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

type LocationType = "restaurants" | "activities";

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

export async function POST(req: Request) {
  try {
    const { error, adminUser } = await requireAdminApiRole([
      "superadmin",
      "admin",
    ]);

    if (error) return error;

    const { userId, locationId, locationType } = await req.json();

    if (!userId && (!locationId || !locationType)) {
      return NextResponse.json(
        { error: "Missing userId or location target" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = adminSupabase();

    if (userId) {
      const { data: targetUser } = await supabase
        .from("users")
        .select("id,email,full_name")
        .eq("id", userId)
        .maybeSingle();

      if (!targetUser) {
        return NextResponse.json(
          { error: "Target user not found" },
          { status: 404 }
        );
      }

      if (targetUser.email === adminUser?.email) {
        return NextResponse.json(
          { error: "You cannot impersonate yourself." },
          { status: 400 }
        );
      }

      cookieStore.delete("theouthaven_impersonate_location_id");
      cookieStore.delete("theouthaven_impersonate_location_type");

      cookieStore.set("theouthaven_impersonate_user_id", targetUser.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 30,
      });

      await supabase.from("admin_impersonation_logs").insert({
        admin_id: adminUser?.id,
        admin_email: adminUser?.email,
        target_user_id: targetUser.id,
        target_user_email: targetUser.email,
        action: "started_user",
      });

      return NextResponse.json({
        success: true,
        message: "User impersonation started.",
        redirectTo: "/locations/dashboard",
      });
    }

    if (!["restaurants", "activities"].includes(locationType)) {
      return NextResponse.json(
        { error: "Invalid location type" },
        { status: 400 }
      );
    }

    const table = locationType as LocationType;
    const nameField =
      table === "restaurants" ? "restaurant_name" : "activity_name";

    const { data: location } = await supabase
      .from(table)
      .select(
        `id, ${nameField}, owner_email, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id`
      )
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    cookieStore.delete("theouthaven_impersonate_user_id");

    cookieStore.set("theouthaven_impersonate_location_id", String(location.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });

    cookieStore.set("theouthaven_impersonate_location_type", table, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });

    await supabase.from("admin_impersonation_logs").insert({
      admin_id: adminUser?.id,
      admin_email: adminUser?.email,
      target_user_id: location.owner_user_id || null,
      target_user_email: location.owner_email || null,
      action: `started_location_${table}`,
    });

    return NextResponse.json({
      success: true,
      message: "Location impersonation started.",
      redirectTo: "/locations/dashboard",
    });
  } catch (error) {
    console.error("Impersonation error:", error);

    return NextResponse.json(
      { error: "Failed to start impersonation" },
      { status: 500 }
    );
  }
}