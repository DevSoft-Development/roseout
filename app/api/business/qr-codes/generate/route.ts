import { NextRequest, NextResponse } from "next/server";
import { generateMissingLocationQrs } from "@/lib/qr/locationQr";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = body.locationId ? String(body.locationId) : undefined;
  const result = await generateMissingLocationQrs(locationId ? 1 : 100, locationId ? [locationId] : undefined);
  return NextResponse.json({ success: true, message: "QR codes are ready.", result });
}
