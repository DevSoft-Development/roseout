import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

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

export default async function ProofReviewPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const { data = [] } = await adminDb
    .from("team_proofs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const proofRows = data || [];
  const userIds = Array.from(
    new Set(
      proofRows
        .map((proof) => String(proof.user_id || "").trim())
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
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Team · Review"
        title="Proof Review"
        subtitle="Proofs are for site visits and social outreach. Support tickets are intentionally excluded."
        badge={<AdminStatusBadge tone="green">{proofRows.length} proofs loaded</AdminStatusBadge>}
      />

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {proofRows.map((proof) => {
            const user = usersById.get(String(proof.user_id));
            return (
              <article
                key={proof.id}
                className="rounded-3xl border border-white/10 bg-[#111] p-5"
              >
                <p className="text-xs font-black uppercase tracking-widest text-rose-300">
                  {labelize(proof.source_type)} · {labelize(proof.proof_type)}
                </p>
                <p className="mt-2 text-sm text-white/55">
                  {user?.full_name || user?.email || proof.user_id} ·{" "}
                  {formatDateTime(proof.created_at)}
                </p>
                <a
                  href={proof.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black"
                >
                  Open proof
                </a>
                <p className="mt-3 text-sm font-bold text-white/65">
                  Review: {labelize(proof.manager_review_status)} · Public use:{" "}
                  {proof.approved_for_public_use ? "Approved" : "No"}
                </p>
              </article>
            );
          })}
        </div>
    </AdminPageShell>
  );
}
