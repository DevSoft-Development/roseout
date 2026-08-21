import { logClaimFunnelEvent, lookupSecureClaim } from "@/lib/business-claim/secureClaim";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const lookup = await lookupSecureClaim(body.code);

    if (!lookup.ok) {
      return Response.json(
        { ok: false, error: lookup.error },
        { status: lookup.error === "invalid_code" ? 404 : lookup.error === "empty_code" ? 400 : 409 },
      );
    }

    const source = body.source === "qr" ? "qr" : "manual";
    await Promise.allSettled([
      logClaimFunnelEvent({
        locationId: lookup.location.id,
        claimCodeId: lookup.claimCode?.id || null,
        eventType: "claim_page_opened",
        metadata: { source },
      }),
      ...(source === "qr"
        ? [
            logClaimFunnelEvent({
              locationId: lookup.location.id,
              claimCodeId: lookup.claimCode?.id || null,
              eventType: "qr_scanned",
              metadata: {},
            }),
          ]
        : []),
    ]);

    return Response.json({
      ok: true,
      claimCodeId: lookup.claimCode?.id || null,
      location: lookup.publicLocation,
    });
  } catch (error) {
    console.error("Claim code verification failed", error);
    return Response.json({ ok: false, error: "invalid_code" }, { status: 500 });
  }
}
