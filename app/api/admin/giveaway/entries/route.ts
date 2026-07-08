import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { getBetaAccountReadinessForEntries } from "@/lib/beta/accountReadiness";

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.giveaway);
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const search = url.searchParams.get("search")?.trim();
  let query = supabaseAdmin.from("launch_waitlist_signups").select("*").order("created_at", { ascending: false }).limit(500);

  if (filter === "launch_list_only") query = query.eq("wants_giveaway", false);
  if (filter === "giveaway_entries") query = query.eq("wants_giveaway", true);
  if (["email_unverified", "pending_verification", "verified", "disqualified", "winner", "alternate"].includes(filter)) query = query.eq("giveaway_status", filter);
  if (filter === "missing_social_handle") query = query.eq("wants_giveaway", true).or("social_handle.is.null,social_handle.eq.");
  if (filter === "duplicate_flagged") query = query.eq("duplicate_flag", true);
  if (["instagram", "tiktok", "both"].includes(filter)) query = query.eq("social_platform", filter);
  if (filter === "followed_self_reported") query = query.eq("followed_social", true);
  if (filter === "tagged_self_reported") query = query.eq("tagged_two_friends", true);
  if (search) {
    const safe = search.replace(/[%_]/g, "");
    query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,social_handle.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const baseEntries = data || [];
  const readinessList = await getBetaAccountReadinessForEntries(baseEntries);
  const entries = await Promise.all(baseEntries.map(async (entry, index) => ({
    ...entry,
    beta_account_readiness: readinessList[index],
    beta_giveaway_eligibility: await getBetaGiveawayEligibilityForEmail(entry.email || ""),
  })));
  const stats = {
    total: entries.length,
    launchListOnly: entries.filter((entry) => !entry.wants_giveaway).length,
    giveawayEntries: entries.filter((entry) => entry.wants_giveaway).length,
    loginReady: entries.filter((entry) => entry.beta_account_readiness?.loginReady).length,
    needsSetup: entries.filter((entry) => entry.beta_account_readiness?.needsSetupEmail).length,
    pendingVerification: entries.filter((entry) => entry.giveaway_status === "pending_verification").length,
    verifiedEntries: entries.filter((entry) => entry.giveaway_status === "verified").length,
    missingSocialHandle: entries.filter((entry) => entry.wants_giveaway && !entry.social_handle).length,
    duplicateFlagged: entries.filter((entry) => entry.duplicate_flag).length,
    winnerSelected: entries.filter((entry) => entry.giveaway_status === "winner").length,
  };
  const { data: duplicateEvents } = await supabaseAdmin.from("launch_waitlist_duplicate_events").select("*").order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ success: true, entries, duplicateEvents: duplicateEvents || [], stats });
}
