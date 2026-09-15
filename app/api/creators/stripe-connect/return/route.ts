import { NextResponse } from "next/server";
import { findCreatorForUser, refreshCreatorConnectStatus } from "@/lib/creator-partners/program";
import { getSiteUrl } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${getSiteUrl()}/login?next=${encodeURIComponent("/creator/dashboard")}`);
    const creator = await findCreatorForUser(user.id, user.email);
    if (!creator) return NextResponse.redirect(`${getSiteUrl()}/creators/apply`);
    const result = await refreshCreatorConnectStatus(creator);
    return NextResponse.redirect(`${getSiteUrl()}/creator/dashboard?payouts=${result.ready ? "ready" : "pending"}`);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/creator/dashboard?payouts=error`);
  }
}
