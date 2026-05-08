import crypto from "crypto";
import QRCode from "qrcode";

export type ClaimLocationType = "restaurant" | "activity";

export async function createClaimQr(type: ClaimLocationType) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";

  const claimToken = crypto.randomUUID();

  const claimPath = type === "activity" ? "claim-activity" : "claim";

  const claimUrl = `${siteUrl}/${claimPath}/${claimToken}`;

  const qrCodeDataUrl = await QRCode.toDataURL(claimUrl, {
    margin: 2,
    width: 700,
  });

  return {
    claim_token: claimToken,
    claim_url: claimUrl,
    claim_status: "unclaimed",
    qr_code_data_url: qrCodeDataUrl,
  };
}