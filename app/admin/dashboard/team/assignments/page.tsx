import { requireAdminRole } from "@/lib/admin-auth";
import { listAssignableTeamMembers, searchWorkspaceLocationsForUser } from "@/lib/team-tools";
import AdminAssignLocationsClient from "@/components/AdminAssignLocationsClient";

export const dynamic = "force-dynamic";

export default async function TeamAssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdminRole(["superadmin", "admin", "manager"]);
  const sp = await searchParams;
  const initialFilters = { q: sp.q || "", partnerSalesStatus: sp.partnerSalesStatus || "all", claimOutreachStatus: sp.claimOutreachStatus || "all", reservationPortalStatus: sp.reservationPortalStatus || "all", reservationEmbedStatus: sp.reservationEmbedStatus || "all", discoveryProfileStatus: sp.discoveryProfileStatus || "all", planStatus: sp.planStatus || "all", assigned: sp.assigned || "all", launchPilot: sp.launchPilot || "all", partnerLaunchSelected: sp.partnerLaunchSelected || "all" };
  const [locations, teamMembers] = await Promise.all([searchWorkspaceLocationsForUser(admin.user_id, admin.role, initialFilters.q, { ...initialFilters, limit: 50 }), listAssignableTeamMembers()]);
  return <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.2),transparent_34%),#0d0d0f] p-6"><p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Team</p><h1 className="mt-3 text-4xl font-black">Team Assignments</h1><p className="mt-3 max-w-4xl text-sm font-bold leading-6 text-white/60">Assign locations to team members by market, city, borough, neighborhood, category, claim status, and work type. Use the filters for ZIP, location type, outreach status, searchable status, data quality status, needs photos, needs outreach, needs claim code mailer, and needs site visit planning.</p></section><section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Assignment writes are connected to the existing workspace assignment API. This does not change ownership or claim status.</section><AdminAssignLocationsClient initialLocations={locations} teamMembers={teamMembers} initialFilters={initialFilters} /></div></main>;
}
