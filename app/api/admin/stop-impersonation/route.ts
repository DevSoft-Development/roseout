import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  [
    "theouthaven_impersonate_user_id",
    "roseout_impersonate_user_id",
    "theouthaven_impersonate_location_id",
    "roseout_impersonate_location_id",
    "theouthaven_impersonate_location_type",
    "roseout_impersonate_location_type",
  ].forEach((name) => cookieStore.delete(name));

  return NextResponse.json({ success: true });
}