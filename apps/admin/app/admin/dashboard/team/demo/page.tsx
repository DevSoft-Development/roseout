import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { formatFullAddress } from "@/lib/address-utils";

export const dynamic = "force-dynamic";

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function DemoAdminPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);

  const db = getAdminDatabaseClient();
  const [{ data: masters = [] }, { data: sessions = [] }, auth] =
    await Promise.all([
      db.from("crm_demo_locations").select("*").order("demo_name"),
      db
        .from("crm_demo_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const masterRows = masters || [];
  const sessionRows = sessions || [];
  const userById = new Map(
    (auth.data?.users || []).map((user) => [
      user.id,
      {
        email: user.email ?? null,
        name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null,
      },
    ]),
  );

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
              Team Tools
            </p>
            <h1 className="mt-2 text-3xl font-black">Demo / Training</h1>
          </div>
          <Link
            href="/admin/dashboard/settings/demo-center?mode=training"
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white"
          >
            Open Unified Demo Center
          </Link>
        </div>

        <p className="mt-2 max-w-4xl text-sm font-bold text-white/55">
          Master demo locations are separate from public locations. Personal
          sessions use editable private copies and never send real notifications.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {masterRows.map((master: any) => (
            <article
              key={master.id}
              className="rounded-3xl border border-white/10 bg-[#111] p-5"
            >
              <p className="text-xs font-black uppercase tracking-widest text-rose-300">
                {labelize(master.demo_type)}
              </p>
              <h2 className="mt-1 text-xl font-black">{master.demo_name}</h2>
              <p className="mt-2 text-sm text-white/55">
                {formatFullAddress({
                  address: master.address,
                  city: master.city,
                  state: master.state,
                  zip_code: master.zip_code,
                })}
              </p>
            </article>
          ))}
          {masterRows.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-white/10 p-6 text-sm font-bold text-white/45">
              No master demo locations found.
            </p>
          ) : null}
        </section>

        <h2 className="mt-8 text-2xl font-black">Active sessions</h2>
        <div className="mt-4 grid gap-3">
          {sessionRows.map((session: any) => {
            const user = userById.get(session.user_id);
            return (
              <div
                key={session.id}
                className="rounded-2xl border border-white/10 bg-[#111] p-4"
              >
                <p className="font-black">{session.session_name || session.id}</p>
                <p className="mt-1 text-xs font-bold text-white/45">
                  {user?.name || user?.email || session.user_id} ·{" "}
                  {labelize(session.status)} · Expires{" "}
                  {formatDateTime(session.expires_at)}
                </p>
              </div>
            );
          })}
          {sessionRows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm font-bold text-white/45">
              No demo or training sessions found.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
