import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ message: "Not signed in" }, { status: 401 });

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: url.searchParams.get("locationId"),
    adminLocationId: url.searchParams.get("adminLocationId"),
    demoLocationId: url.searchParams.get("demoLocationId"),
    sourceId: url.searchParams.get("sourceId"),
    type: url.searchParams.get("type"),
    demo: url.searchParams.get("demo") === "1" || url.searchParams.get("demo") === "true",
    fromDemoCenter: url.searchParams.get("fromDemoCenter") === "1" || url.searchParams.get("fromDemoCenter") === "true",
    allowDemoPreview: true,
    permission: "marketing.view",
  });

  if (guard.error) {
    return NextResponse.json(
      { message: "You do not have access to this location." },
      { status: guard.error.status },
    );
  }

  const hasMenu = false, hasQr = true;
  return NextResponse.json({
    locationId: guard.access.canonicalLocationId,
    suggestions: [
      { title: "Social post idea", channel: "Instagram or TikTok", cta: "Plan your night out" },
      { title: "Promo idea", channel: "Offer", cta: "Claim this week" },
      { title: "Event/night-out caption", channel: "Social", cta: "Bring your crew" },
      { title: "Business profile improvement", channel: "TheOutHaven profile", cta: "Save this spot" },
      ...(hasMenu ? [{ title: "Menu promotion", channel: "Menu", cta: "View the menu" }] : []),
      ...(hasQr ? [{ title: "QR promotion", channel: "QR code", cta: "Scan for details" }] : []),
    ],
  });
}
