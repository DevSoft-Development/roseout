import crypto from "crypto";
import { signLocationLeadContract } from "@/lib/leads/private-events";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = clean(body.token, 80);
    const signerName = clean(body.signerName, 160);
    const signerEmail = clean(body.signerEmail, 254);
    if (!token || !signerName || !signerEmail) {
      return Response.json({ error: "Proposal token, signer name, and signer email are required." }, { status: 400 });
    }
    const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
    const signatureIpHash = crypto.createHash("sha256").update(`${token}:${ip}`).digest("hex");
    const result = await signLocationLeadContract({ token, signerName, signerEmail, signatureIpHash });
    return Response.json({
      ok: true,
      leadId: result.lead.id,
      contractStatus: result.lead.contract_status,
      checkoutUrl: result.checkoutUrl,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not sign the event contract." }, { status: 500 });
  }
}
