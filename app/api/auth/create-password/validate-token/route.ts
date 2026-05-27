import { NextResponse } from "next/server";
import { formatPasswordSetupExpiry, hashPasswordSetupToken, isPasswordSetupExpired } from "@/lib/auth/passwordSetupTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";

function invalid(status: "missing" | "invalid" | "expired" | "used", message: string) {
  return NextResponse.json({ ok: false, status, message });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  return validateToken(token);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return validateToken(body?.token);
}

async function validateToken(rawToken: unknown) {
  const token = String(rawToken || "").trim();
  if (!token) return invalid("missing", "This password setup link is missing a token.");

  const tokenHash = hashPasswordSetupToken(token);
  const { data: invite } = await supabaseAdmin
    .from("password_setup_tokens")
    .select("id,user_id,email,role,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite) return invalid("invalid", "This setup link is invalid or no longer active.");
  if (invite.used_at) return invalid("used", "This setup link has already been used.");
  if (isPasswordSetupExpired(invite.expires_at)) return invalid("expired", "This setup link has expired for your security.");

  return NextResponse.json({
    ok: true,
    status: "valid",
    email: invite.email,
    role: invite.role,
    first_name: "",
    expires_at: invite.expires_at,
    expires_at_display: formatPasswordSetupExpiry(invite.expires_at),
  });
}
