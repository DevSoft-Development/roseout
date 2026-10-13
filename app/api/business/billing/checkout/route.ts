import { NextResponse } from "next/server";
/** Business Pro is retired; this legacy endpoint must never create new charges. */
export async function POST() {
  return NextResponse.json({ error: "Legacy checkout retired. Select Essential+, Select+, or Signature+ through Business Portal." }, { status: 410 });
}
