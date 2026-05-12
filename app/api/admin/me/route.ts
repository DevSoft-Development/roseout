import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAppSession } from "@/lib/app-session";
import { getAdminDashboardAccess } from "@/lib/account-permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const appSession = await getAppSession();

  const adminAccess = await getAdminDashboardAccess({
    id: user?.id || appSession?.id || null,
    email: user?.email || appSession?.email || null,
    role: user?.user_metadata?.role || appSession?.role || null,
  });

  if (!adminAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      user: {
        id: user?.id || appSession?.id || null,
        email: adminAccess.email,
        full_name:
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          appSession?.fullName ||
          adminAccess.fullName ||
          "Admin",
      },
      role: adminAccess.role,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
