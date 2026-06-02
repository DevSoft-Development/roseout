import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TurnstileVerifyResult } from "@/types/beta";

type VerifyInput = { token: string | null | undefined; remoteIp?: string | null; expectedAction?: string; source?: string; metadata?: Record<string, unknown> };
type BypassInput = { isAuthenticated?: boolean; isAdmin?: boolean; isBetaTester?: boolean };

export function isTurnstileEnabled() { return String(process.env.TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false"; }
export function getTurnstileSiteKey() { return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""; }
export function shouldBypassTurnstileForUser(input: BypassInput) {
  if (input.isAdmin && String(process.env.TURNSTILE_BYPASS_FOR_ADMIN ?? "true").toLowerCase() === "true") return true;
  if ((input.isAuthenticated || input.isBetaTester) && String(process.env.TURNSTILE_BYPASS_FOR_AUTHENTICATED ?? "true").toLowerCase() === "true") return true;
  return false;
}

async function logTurnstile(input: { source?: string; action?: string | null; hostname?: string | null; remoteIp?: string | null; success: boolean; errorCodes?: string[]; challengeTs?: string | null; metadata?: Record<string, unknown> }) {
  try {
    await supabaseAdmin.from("turnstile_verification_logs").insert({
      source: input.source || "unknown",
      action: input.action ?? null,
      hostname: input.hostname ?? null,
      remote_ip: input.remoteIp ?? null,
      success: input.success,
      error_codes: input.errorCodes ?? [],
      challenge_ts: input.challengeTs ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("Turnstile log insert failed", error);
  }
}

export async function verifyTurnstileToken(input: VerifyInput): Promise<TurnstileVerifyResult> {
  if (!isTurnstileEnabled()) return { success: true, bypassed: true, bypassReason: "turnstile_disabled" };
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["missing_secret"], metadata: input.metadata });
      return { success: false, errorCodes: ["missing_secret"] };
    }
    return { success: true, bypassed: true, bypassReason: "missing_secret_development" };
  }
  const token = input.token?.trim();
  if (!token) {
    await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["missing_token"], metadata: input.metadata });
    return { success: false, errorCodes: ["missing_token"] };
  }
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (input.remoteIp) form.set("remoteip", input.remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; challenge_ts?: string; hostname?: string; action?: string; cdata?: string; "error-codes"?: string[] };
    const actionMismatch = Boolean(input.expectedAction && json.action && json.action !== input.expectedAction);
    const success = Boolean(json.success) && !actionMismatch;
    const errorCodes = [...(json["error-codes"] ?? []), ...(actionMismatch ? ["action_mismatch"] : [])];
    await logTurnstile({ source: input.source, action: json.action, hostname: json.hostname, remoteIp: input.remoteIp, success, errorCodes, challengeTs: json.challenge_ts, metadata: { ...(input.metadata ?? {}), expectedAction: input.expectedAction, cdata: json.cdata } });
    return { success, action: json.action, hostname: json.hostname, challengeTs: json.challenge_ts, errorCodes };
  } catch {
    await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["verification_request_failed"], metadata: input.metadata });
    return { success: false, errorCodes: ["verification_request_failed"] };
  }
}
