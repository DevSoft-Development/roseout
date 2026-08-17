import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { buildThreeCxWebClientCallUrl } from "@/lib/integrations/three-cx";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CrmCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { id } = await params;

  const [{ data: location, error: locationError }, { data: activities }] =
    await Promise.all([
      supabaseAdmin
        .from("locations")
        .select("id,name,phone,owner_email,city,state")
        .eq("id", id)
        .maybeSingle(),
      supabaseAdmin
        .from("crm_activities")
        .select("id,summary,activity_type,source_system,created_at")
        .eq("location_id", id)
        .eq("source_system", "3cx")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  if (locationError) {
    console.error("crm_3cx_location_load_failed", {
      code: locationError.code,
      message: locationError.message,
      locationId: id,
    });
  }
  if (!location) notFound();

  const phone = String(location.phone || "").trim();
  const callHref = buildThreeCxWebClientCallUrl(
    process.env.THREE_CX_WEBCLIENT_URL,
    phone,
  );
  const threeCxConfigured = Boolean(callHref);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-[#120d0b] p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
            CRM · 3CX Calling
          </p>
          <h1 className="mt-2 text-3xl font-black">{location.name}</h1>
          <p className="mt-2 text-sm text-white/55">
            {location.city || ""}{location.city && location.state ? ", " : ""}{location.state || ""}
          </p>
        </div>
        <Link
          href={`/admin/dashboard/crm/${location.id}?tab=communication`}
          className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-black text-white/75"
        >
          Back to Communication
        </Link>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
            Business phone
          </p>
          <p className="mt-3 text-3xl font-black">{phone || "No phone on file"}</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            The call action opens the configured 3CX Web Client directly with this number ready to dial. It does not use the device&apos;s generic telephone handler, so macOS will not route the action to FaceTime.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {callHref ? (
              <a
                href={callHref}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30"
              >
                Call
              </a>
            ) : phone ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-5 py-3 text-sm font-black text-amber-100">
                Configure 3CX Web Client URL before calling
              </span>
            ) : (
              <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-5 py-3 text-sm font-black text-amber-100">
                Add a phone number before calling
              </span>
            )}
            <Link
              href={`/admin/dashboard/crm/${location.id}?tab=profile`}
              className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-white/75"
            >
              Edit contact details
            </Link>
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
            Integration status
          </p>
          <ul className="mt-4 space-y-3 text-sm text-white/65">
            <li>CRM contact: {location.owner_email || "Owner email not available"}</li>
            <li>Lookup endpoint: server-side and API-key protected</li>
            <li>Call journal: writes completed calls to CRM activity</li>
            <li>3CX Web Client: {threeCxConfigured ? "configured" : "configuration required"}</li>
          </ul>
        </aside>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
              3CX activity
            </p>
            <h2 className="mt-2 text-2xl font-black">Recent calls</h2>
          </div>
          <span className="text-xs font-bold text-white/40">Latest 25</span>
        </div>
        {activities?.length ? (
          <div className="mt-4 divide-y divide-white/10">
            {activities.map((activity: any) => (
              <div key={activity.id} className="grid gap-1 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <span className="text-xs font-bold text-white/45">
                  {formatDate(activity.created_at)}
                </span>
                <span className="text-sm text-white/75">{activity.summary}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">
            No 3CX calls have been journaled for this location yet.
          </p>
        )}
      </section>
    </main>
  );
}
