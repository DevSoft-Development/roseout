import { NextRequest, NextResponse } from "next/server";
import { createCreatorOnboardingLink, createCreatorRecipientAccount, findCreatorForUser } from "@/lib/creator-partners/program";
import { getSiteUrl } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

async function handle() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${getSiteUrl()}/login?next=${encodeURIComponent("/creator/dashboard")}`, 303);
  const creator = await findCreatorForUser(user.id, user.email);
  if (!creator || creator.application_status !== "approved" || creator.status !== "active") return NextResponse.redirect(`${getSiteUrl()}/creator/dashboard?payouts=unavailable`, 303);

  let accountId = String(creator.stripe_connect_account_id || "");
  if (!accountId) {
    const account = await createCreatorRecipientAccount(creator);
    accountId = account.id;
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("gtm_creator_sources").update({ stripe_connect_account_id: accountId, stripe_connect_account_api_version: "v2", stripe_connect_onboarding_status: "pending", stripe_connect_payouts_enabled: false, updated_at: now }).eq("id", creator.id);
    if (error) throw error;
  }

  const link = await createCreatorOnboardingLink({ ...creator, stripe_connect_account_id: accountId, stripe_connect_account_api_version: "v2" });
  return NextResponse.redirect(link.url, 303);
}

export async function GET(_request: NextRequest) {
  try { return await handle(); }
  catch { return NextResponse.redirect(`${getSiteUrl()}/creator/dashboard?payouts=error`, 303); }
}

export async function POST(_request: NextRequest) {
  try { return await handle(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "We couldn’t start payout setup." }, { status: 500 }); }
}
