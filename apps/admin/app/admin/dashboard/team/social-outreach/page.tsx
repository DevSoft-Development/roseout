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

export default async function SocialAdmin() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const [{ data = [] }, { data: templates = [] }] = await Promise.all([
    adminDb
      .from("ambassador_social_outreach")
      .select("*, locations(name, location_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    adminDb
      .from("social_outreach_templates")
      .select("*")
      .eq("is_active", true)
      .order("template_name"),
  ]);

  const outreachRows = data || [];
  const templateRows = templates || [];
  const userIds = Array.from(
    new Set(
      outreachRows
        .map((outreach) => String(outreach.user_id || "").trim())
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
        <h1 className="text-3xl font-black">Social Outreach</h1>
        <p className="mt-2 text-sm font-bold text-white/55">
          Workflow tracking only. No GPS/location and no stored social
          passwords.
        </p>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-[#111] p-5">
          <h2 className="text-xl font-black">Approved templates</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {templateRows.map((template) => (
              <div
                key={template.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="font-black">{template.template_name}</p>
                <p className="mt-2 text-xs text-white/55">
                  {template.message_body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-4">
          {outreachRows.map((outreach) => {
            const user = usersById.get(String(outreach.user_id));
            return (
              <article
                key={outreach.id}
                className="rounded-3xl border border-white/10 bg-[#111] p-5"
              >
                <p className="text-xs font-black uppercase tracking-widest text-rose-300">
                  {outreach.locations?.name ||
                    outreach.locations?.location_name ||
                    outreach.location_id}
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {labelize(outreach.platform)} ·{" "}
                  {labelize(outreach.outreach_stage)}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {user?.full_name || user?.email || outreach.user_id} ·{" "}
                  {formatDateTime(outreach.created_at)}
                </p>
                <p className="mt-2 text-sm font-bold text-white/65">
                  Message: {labelize(outreach.message_status)} · Reply:{" "}
                  {labelize(outreach.reply_status)} · Proof:{" "}
                  {outreach.proof_uploaded ? "Uploaded" : "Pending/optional"}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
