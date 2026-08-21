import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(req.url);

  const { data: item, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("id,claim_code,status,mailed_at,first_scan_at")
    .eq("tracking_token", token)
    .maybeSingle();

  if (error || !item?.claim_code) {
    return NextResponse.redirect(new URL("/business/claim", url.origin));
  }

  if (item.mailed_at && !item.first_scan_at) {
    const nextStatus = ["claim_started", "claimed", "returned", "cancelled"].includes(String(item.status || ""))
      ? item.status
      : "scanned";

    await supabaseAdmin
      .from("mailing_batch_items")
      .update({ first_scan_at: new Date().toISOString(), status: nextStatus })
      .eq("id", item.id)
      .is("first_scan_at", null);
  }

  const target = new URL("/business/claim", url.origin);
  target.searchParams.set("code", item.claim_code);
  target.searchParams.set("source", "postcard");
  return NextResponse.redirect(target);
}
