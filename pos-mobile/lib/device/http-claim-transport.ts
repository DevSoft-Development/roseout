import type { PosClaimTransport } from "@/lib/device/identity";

export class HttpPosClaimTransport implements PosClaimTransport {
  constructor(private readonly baseUrl: string) {}

  async claim(input: { pairingCode: string; installationId: string }) {
    const pairingCode = String(input.pairingCode || "").trim();
    const separator = pairingCode.indexOf(".");
    if (separator <= 0) throw new Error("pos_claim_pairing_code_invalid");
    const deviceId = pairingCode.slice(0, separator);
    const claimCode = pairingCode.slice(separator + 1);
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/api/business/pos/devices/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          claimCode,
          installationId: input.installationId,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || "pos_claim_failed");
    return {
      deviceId: String(body.deviceId),
      locationId: String(body.locationId),
      locationName: typeof body.locationName === "string" ? body.locationName : null,
      credential: String(body.credential),
    };
  }
}
