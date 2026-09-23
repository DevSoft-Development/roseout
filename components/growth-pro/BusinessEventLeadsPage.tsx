import { EventLeadWorkspaceClient } from "@/components/growth-pro/EventLeadWorkspaceClient";
import { GrowthProShell } from "@/components/growth-pro/GrowthProShell";
import { buildDemoOwnerHref, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function BusinessEventLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams> | DemoSearchParams;
}) {
  const params = searchParams ? await searchParams : undefined;
  const demo = await requireDemoOwnerLocation(params as any);
  const requestedLocationId = params
    ? String((Array.isArray((params as any).locationId) ? (params as any).locationId[0] : (params as any).locationId) || "")
    : "";
  const location = demo.location || await getCurrentBusinessLocation(requestedLocationId || undefined);

  if (!location) {
    return (
      <GrowthProShell title="Private Events & Catering">
        <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
          No claimed location is available.
        </div>
      </GrowthProShell>
    );
  }

  const { data: leads, error } = await supabaseAdmin
    .from("location_leads")
    .select("*")
    .eq("location_id", location.id)
    .in("lead_type", ["private_event", "catering"])
    .order("created_at", { ascending: false })
    .limit(100);

  const navHrefBuilder = (href: string) => {
    if (demo.demoMode) return buildDemoOwnerHref(href, location) || href;
    return href;
  };

  return (
    <GrowthProShell
      title="Private Events & Catering"
      eyebrow="Essentials+ Revenue Workspace"
      demoMode={demo.demoMode}
      returnHref={demo.demoMode ? "/admin/dashboard/settings/demo-center" : undefined}
      navHrefBuilder={navHrefBuilder}
    >
      <div className="space-y-5">
        <section className="rounded-3xl border border-rose-300/15 bg-rose-500/[0.06] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">{getLocationName(location, "Location")}</p>
          <h2 className="mt-2 text-2xl font-black">Lead → proposal → agreement → payment → completion</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--business-muted)]">
            Private events and catering share one commercial pipeline. Quotes, e-signatures, deposits, final balances, and confirmed revenue stay attached to the original location lead.
          </p>
        </section>
        {error ? (
          <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">
            Event leads are temporarily unavailable.
          </div>
        ) : (
          <EventLeadWorkspaceClient locationId={location.id} initialLeads={leads || []} />
        )}
      </div>
    </GrowthProShell>
  );
}
