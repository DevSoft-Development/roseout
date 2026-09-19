import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyMetaSignedRequest } from "@/lib/marketing/meta-signed-request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const signedRequest = String(form.get("signed_request") || "");
    if (!signedRequest) return NextResponse.json({ success: false, error: "Missing signed_request" }, { status: 400 });
    verifyMetaSignedRequest(signedRequest);

    const { data: connections, error } = await supabaseAdmin
      .from("marketing_social_connections")
      .select("id")
      .eq("scope", "platform")
      .in("provider", ["facebook", "instagram"]);
    if (error) throw error;

    const ids = (connections || []).map((row) => row.id).filter(Boolean);
    if (ids.length) {
      await supabaseAdmin.from("marketing_social_connection_secrets").delete().in("connection_id", ids);
      const { error: updateError } = await supabaseAdmin
        .from("marketing_social_connections")
        .update({ status: "disconnected", last_error: "Meta authorization revoked", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Meta deauthorization callback failed", error);
    return NextResponse.json({ success: false, error: "Invalid deauthorization request" }, { status: 400 });
  }
}
