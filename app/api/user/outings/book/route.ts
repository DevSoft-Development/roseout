import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
function s(v: any) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      {
        success: false,
        error: "AUTH_REQUIRED",
        message:
          "Create a free account or log in to save this outing to your dashboard.",
      },
      { status: 401 },
    );
  const b = await req.json().catch(() => ({}));
  const saved = s(b.saved_plan_id || b.planId);
  const reservation = s(b.reservation_id);
  const dedupe =
    saved || reservation
      ? null
      : crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              u: user.id,
              r: b.restaurant_id || b.restaurant_name,
              a: b.activity_id || b.activity_name,
              t: b.outing_date,
              p: b.prompt,
            }),
          )
          .digest("hex");
  const row: any = {
    user_id: user.id,
    saved_plan_id: saved,
    reservation_id: reservation,
    dedupe_key: dedupe,
    source: s(b.source) || "book_my_outing",
    status: s(b.status) || "booked",
    title: s(b.title) || "TheOutHaven Outing",
    prompt: s(b.prompt),
    outing_date: s(b.outing_date),
    party_size: Number.isFinite(Number(b.party_size))
      ? Number(b.party_size)
      : null,
    restaurant_id: s(b.restaurant_id),
    restaurant_name: s(b.restaurant_name),
    restaurant_address: s(b.restaurant_address),
    restaurant_image: s(b.restaurant_image),
    restaurant_url: s(b.restaurant_url),
    activity_id: s(b.activity_id),
    activity_name: s(b.activity_name),
    activity_address: s(b.activity_address),
    activity_image: s(b.activity_image),
    activity_url: s(b.activity_url),
    plan_payload: b.plan_payload || b.plan || {},
    reservation_payload: b.reservation_payload || {},
    booked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let q = supabaseAdmin
    .from("user_outings")
    .upsert(row, {
      onConflict: saved
        ? "user_id,saved_plan_id"
        : reservation
          ? "user_id,reservation_id"
          : "user_id,dedupe_key",
    })
    .select("id")
    .single();
  const { data, error } = await q;
  if (error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        message:
          "We could not save this to your dashboard yet, but you can continue booking.",
      },
      { status: 200 },
    );
  return NextResponse.json({
    success: true,
    outingId: data.id,
    alreadyExists: false,
    redirectTo: `/user/dashboard/outings/${data.id}`,
  });
}
