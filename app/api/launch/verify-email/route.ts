import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VerifyRow = {
  id: string;
  wants_giveaway: boolean | null;
  giveaway_status: string | null;
  email_verification_expires_at: string | null;
  email_verified: boolean | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function redirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) return redirect(request, "/launch/verified?status=invalid");

  const tokenHash = hashToken(token);
  const { data } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select("id,wants_giveaway,giveaway_status,email_verification_expires_at,email_verified")
    .eq("email_verification_token_hash", tokenHash)
    .maybeSingle<VerifyRow>();

  if (!data) return redirect(request, "/launch/verified?status=invalid");
  if (data.email_verified) return redirect(request, "/launch/verified?status=already_verified");
  if (!data.email_verification_expires_at || new Date(data.email_verification_expires_at).getTime() < Date.now()) {
    return redirect(request, "/launch/verified?status=invalid");
  }

  const wantsGiveaway = Boolean(data.wants_giveaway);
  const updates: Record<string, string | boolean | null> = {
    email_verified: true,
    email_verified_at: new Date().toISOString(),
    email_verification_token_hash: null,
  };
  if (wantsGiveaway && data.giveaway_status === "email_unverified") {
    updates.giveaway_status = "pending_verification";
  }
  if (!wantsGiveaway) {
    updates.giveaway_status = "not_entered";
  }

  await supabaseAdmin.from("launch_waitlist_signups").update(updates).eq("id", data.id);
  return redirect(request, wantsGiveaway ? "/launch/verified?status=success&giveaway=1" : "/launch/verified?status=success&giveaway=0");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();
  const url = new URL(request.url);
  if (token) url.searchParams.set("token", token);
  return GET(new Request(url));
}
