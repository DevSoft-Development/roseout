import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return new Response("Not found", { status: 404 });
  const { data } = await supabaseAdmin.from("experience_bookings").select("public_token,status").eq("public_token", token).maybeSingle();
  if (!data || data.status === "cancelled") return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(`https://www.theouthaven.com/experience-bookings/${token}`, { type: "png", width: 420, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Content-Disposition": "inline" } });
}
