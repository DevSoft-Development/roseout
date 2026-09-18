import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SiteVisitsAdmin() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const { data = [] } = await adminDb
    .from("ambassador_site_visits")
    .select("*, locations(name, location_name)")
    .order("visit_started_at", { ascending: false })
    .limit(100);

  const visitRows = data || [];
  const userIds = Array.from(
    new Set(
      visitRows
        .map((visit) => String(visit.user_id || "").trim())
        .filter(Boolean),
    ),
  );
  const usersById = new Map<
    string,
    { email: string | null; full_name: string | null }
  >();

  if (userIds.length) {
    const { data: authData } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    for (const user of authData?.users || []) {
      if (!userIds.includes(user.id)) continue;
      usersById.set(user.id, {
        email: user.email ?? null,
        full_name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null,
      });
    }
  }

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">Site Visit Check-Ins</h1>
        <p className="mt-2 text-sm font-bold text-white/55">
          GPS verification appears only for physical site visits. Raw coordinates
          stay out of the primary UI.
        </p>

        <div className="mt-6 grid gap-4">
          {visitRows.map((visit) => {
            const user = usersById.get(String(visit.user_id));
            return (
              <article
                key={visit.id}
                className="rounded-3xl border border-white/10 bg-[#111] p-5"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-rose-300">
                      {visit.locations?.name ||
                        visit.locations?.location_name ||
                        visit.location_id ||
                        "Location"}
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      {labelize(visit.visit_type)} ·{" "}
                      {labelize(visit.visit_outcome)}
                    </h2>
                    <p className="mt-2 text-sm text-white/55">
                      {user?.full_name || user?.email || visit.user_id} ·{" "}
                      {formatDateTime(visit.visit_started_at)}
                    </p>
                  </div>
                  <span className="h-fit rounded-full bg-white px-3 py-2 text-xs font-black text-black">
                    {labelize(visit.location_verification_status)}
                  </span>
                </div>

                <p className="mt-3 text-sm font-bold text-white/65">
                  Checked in near:{" "}
                  {visit.check_in_reverse_geocoded_address ||
                    "Readable address not available"}
                </p>
                <p className="mt-1 text-sm font-bold text-white/65">
                  Distance from selected location:{" "}
                  {visit.distance_from_business_meters != null
                    ? `${Math.round(
                        Number(visit.distance_from_business_meters) * 3.28084,
                      )} feet`
                    : "Needs review"}
                </p>

                <details className="mt-3 text-xs text-white/40">
                  <summary className="cursor-pointer font-bold">
                    Technical details
                  </summary>
                  <p>
                    Accuracy: {visit.check_in_accuracy_meters || "—"} meters.
                    Raw coordinates are stored for site visit verification only.
                  </p>
                </details>
              </article>
            );
          })}

          {visitRows.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-[#111] p-8 text-center text-sm font-bold text-white/45">
              No site visits yet.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
