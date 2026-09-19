import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return new Response("Not found", { status: 404 });

  const { data: ticket, error } = await supabaseAdmin
    .from("event_tickets")
    .select("public_token,status")
    .eq("public_token", token)
    .maybeSingle();
  if (error || !ticket || ticket.status === "void") return new Response("Not found", { status: 404 });

  const payload = `https://www.theouthaven.com/tickets/${token}`;
  const png = await QRCode.toBuffer(payload, { type: "png", width: 420, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "inline",
    },
  });
}
