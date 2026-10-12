import { NextResponse } from "next/server";
/** Retired: all new paid subscriptions use the verified, per-location three-plan checkout. */
export async function POST() {
  return NextResponse.json({ error: "Legacy Business Pro checkout is retired. Choose Essential+, Select+, or Signature+ in the Business Portal." }, { status: 410 });
}
