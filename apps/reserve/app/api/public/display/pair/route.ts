import { NextRequest, NextResponse } from "next/server";
import { pairLobbyDisplay } from "@/lib/reserve/lobbyDisplay";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ success: false, error: "Enter the 6-digit pairing code." }, { status: 400 });
  }

  const display = await pairLobbyDisplay(code);
  if (!display) {
    return NextResponse.json(
      { success: false, error: "That pairing code is invalid or expired." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    display: { id: display.id, label: display.label },
  });
}
