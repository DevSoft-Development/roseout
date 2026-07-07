import { normalizeClaimCode } from "@/lib/claimQr";
import { submitLocationClaim } from "@/lib/locations/claims";
import { createClient } from "@/lib/supabase-server";
import { requireTurnstile } from "@/lib/security/turnstile";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function phoneDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function errorKey(message?: string) {
  const raw = String(message || "").toLowerCase();
  if (raw.includes("already been claimed")) return "location_claimed";
  if (raw.includes("manual verification")) return "claim_needs_manual_review";
  if (raw.includes("sign in")) return "auth_required";
  return null;
}

export async function POST(req: Request) {
  try {
    const authSupabase = await createClient();
    const { data: userData } = await authSupabase.auth.getUser();
    const user = userData.user;

    if (!user?.id) {
      return Response.json(
        { ok: false, error: "auth_required" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeClaimCode(body.code);
    const businessEmail = clean(body.businessEmail).toLowerCase();
    const businessPhone = clean(body.businessPhone);
    const roleAtBusiness = clean(body.roleAtBusiness);
    const note = clean(body.note);

    if (!code) {
      return Response.json({ ok: false, error: "empty_code" }, { status: 400 });
    }
    if (!businessEmail || !roleAtBusiness) {
      return Response.json(
        { ok: false, error: "missing_details" },
        { status: 400 },
      );
    }

    const turnstile = await requireTurnstile({
      request: req,
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
      action: "business_claim_submit",
    });
    if (!turnstile.success) {
      return Response.json(
        { ok: false, error: "turnstile_failed", message: turnstile.error },
        { status: turnstile.status },
      );
    }

    const ownerPhone = phoneDigits(businessPhone) || businessPhone || undefined;
    const result = await submitLocationClaim({
      token: code,
      contactName: roleAtBusiness,
      email: businessEmail,
      phone: ownerPhone,
      role: roleAtBusiness,
      notes: note || undefined,
      source: "qr",
      userId: user.id,
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: errorKey(result.error) || "submit_failed",
          message: result.error,
        },
        { status: result.status || 500 },
      );
    }

    return Response.json({
      ok: true,
      id: result.claimId,
      claimRequestId: result.claimId,
      confirmationUrl: "/business/claim?submitted=pending",
      message:
        result.status === "pending"
          ? "Claim submitted for review."
          : "Your claim request is already being reviewed.",
    });
  } catch (error) {
    console.error("Claim code submit failed", error);
    return Response.json(
      { ok: false, error: "submit_failed" },
      { status: 500 },
    );
  }
}
