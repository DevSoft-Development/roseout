import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ status: "unknown" }, { status: 400 });
  return NextResponse.json({ status: "completed", confirmation_code: code });
}
