import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyMetaSignedRequest } from "@/lib/marketing/meta-signed-request";

export const dynamic = "force-dynamic";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const signedRequest = String(form.get("signed_request") || "");
    if (!signedRequest) return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
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
      const now = new Date().toISOString();
      for (const id of ids) {
        const { error: updateError } = await supabaseAdmin
          .from("marketing_social_connections")
          .update({
            status: "disconnected",
            provider_account_id: `deleted:${randomBytes(12).toString("hex")}`,
            provider_business_id: null,
            display_name: null,
            username: null,
            granted_scopes: [],
            token_expires_at: null,
            metadata: {},
            last_error: null,
            updated_at: now,
          })
          .eq("id", id);
        if (updateError) throw updateError;
      }
    }

    const confirmationCode = randomBytes(12).toString("hex");
    const statusUrl = new URL("/api/integrations/meta/data-deletion/status", baseUrl());
    statusUrl.searchParams.set("code", confirmationCode);
    return NextResponse.json({ url: statusUrl.toString(), confirmation_code: confirmationCode });
  } catch (error) {
    console.error("Meta data deletion callback failed", error);
    return NextResponse.json({ error: "Invalid data deletion request" }, { status: 400 });
  }
}
