import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fingerprints() {
  return String(process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET() {
  const sha256CertFingerprints = fingerprints();
  if (sha256CertFingerprints.length === 0) {
    return NextResponse.json({ error: "App association is not configured" }, { status: 503 });
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.theouthaven.app",
          sha256_cert_fingerprints: sha256CertFingerprints,
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
      },
    },
  );
}
