import { NextResponse } from "next/server";
import { findPasswordSetupToken, formatPasswordSetupExpiry, hashPasswordSetupToken, isPasswordSetupExpired, PASSWORD_SETUP_PURPOSE } from "@/lib/auth/passwordSetupTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";

function invalid(status: "missing" | "invalid" | "expired" | "used", message: string) {
  return NextResponse.json({ ok: false, valid: false, status, message });
}

export async function GET(request: Request) {
  return validateRequestToken(request, {});
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return validateRequestToken(request, body);
}

async function validateRequestToken(request: Request, body: Record<string, unknown>) {
  const url = new URL(request.url);
  const rawToken = String(body.token || url.searchParams.get("token") || "").trim();
  if (!rawToken) return invalid("missing", "This password setup link is missing a token.");

  const result = await findPasswordSetupToken(rawToken);
  const tokenHash = hashPasswordSetupToken(rawToken);

  if (result.error) {
    console.error("[password-setup:validate-token-error]", { error: result.error.message, tokenHashPrefix: tokenHash.slice(0, 12) });
    return invalid("invalid", "This setup link is invalid or no longer active.");
  }

  if (!result.data) {
    const { data: hashOnlyMatch } = await supabaseAdmin.from("password_setup_tokens").select("id,purpose,used_at,expires_at").eq("token_hash", tokenHash).limit(1);
    console.info("[password-setup:validate-token]", { tokenLength: rawToken.length, tokenHashPrefix: tokenHash.slice(0, 12), found: false, hashOnlyPurposeMismatch: Boolean(hashOnlyMatch?.length), requestPath: url.pathname });
    return invalid("invalid", "This setup link is invalid or no longer active.");
  }

  const invite = result.data;
  const status = invite.used_at ? "used" : isPasswordSetupExpired(invite.expires_at) ? "expired" : "valid";
  console.info("[password-setup:validate-token]", { tokenLength: rawToken.length, tokenHashPrefix: tokenHash.slice(0, 12), found: true, status, purposeMatched: invite.purpose === PASSWORD_SETUP_PURPOSE, usedAtNull: !invite.used_at, expiresInFuture: !isPasswordSetupExpired(invite.expires_at), requestPath: url.pathname });

  if (invite.used_at) return invalid("used", "This setup link has already been used.");
  if (isPasswordSetupExpired(invite.expires_at)) return invalid("expired", "This setup link has expired for your security.");

  return NextResponse.json({ ok: true, valid: true, status: "valid", email: invite.email, role: invite.role, expires_at: invite.expires_at, expires_at_display: formatPasswordSetupExpiry(invite.expires_at) });
}
