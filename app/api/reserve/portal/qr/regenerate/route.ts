import { NextRequest } from "next/server";
import { ensureReserveLocationQrFields } from "@/lib/reserve/qr-service";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return ensureReserveLocationQrFields(String(body.locationId || ""), "regenerate");
}
