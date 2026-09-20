import { ImageIcon, ShieldCheck, Sparkles, ShieldAlert } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function tone(status: string): "green" | "amber" | "red" | "muted" {
  if (["owned", "licensed", "permission_granted"].includes(status)) return "green";
  if (status === "restricted") return "amber";
  if (status === "expired") return "red";
  return "muted";
}

export default async function MarketingMediaPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data } = await getAdminDatabaseClient()
    .from("marketing_assets")
    .select("id,display_name,asset_type,scope,source,rights_status,allow_theouthaven_feature,allowed_platforms,rights_expires_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const assets = data || [];
  const cleared = assets.filter((a) => ["owned", "licensed", "permission_granted"].includes(a.rights_status)).length;
  const featured = assets.filter((a) => a.allow_theouthaven_feature).length;
  const restricted = assets.filter((a) => a.rights_status === "restricted" || a.rights_status === "expired").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Media Operations"
        title="Media Library"
        subtitle="Track campaign media, usage rights, source provenance, and location media explicitly approved for TheOutHaven features."
        badge={<AdminStatusBadge tone={restricted ? "amber" : "green"}>{restricted ? `${restricted} restricted or expired` : "Media rights healthy"}</AdminStatusBadge>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Assets" value={assets.length} helper="Media records" icon={ImageIcon} />
        <AdminKpiCard label="Cleared" value={cleared} helper="Owned, licensed, or approved" icon={ShieldCheck} />
        <AdminKpiCard label="Feature approved" value={featured} helper="Allowed in TheOutHaven features" icon={Sparkles} />
        <AdminKpiCard label="Restricted" value={restricted} helper="Restricted or expired" icon={ShieldAlert} />
      </AdminKpiGrid>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Rights ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Marketing assets</h2>
          <p className="mt-1 text-sm text-white/50">Usage rights, source, scope, and feature permission in one operating view.</p>
        </div>
        {assets.length ? (
          <div className="divide-y divide-white/10">
            {assets.map((asset) => (
              <article key={asset.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center hover:bg-white/[0.025]">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{asset.display_name || "Untitled asset"}</p>
                  <p className="mt-1 text-xs text-white/45">{asset.asset_type} · {asset.scope} · {asset.source || "source not set"}</p>
                </div>
                <AdminStatusBadge tone={tone(asset.rights_status)}>{asset.rights_status.replaceAll("_", " ")}</AdminStatusBadge>
                <AdminStatusBadge tone={asset.allow_theouthaven_feature ? "green" : "muted"}>{asset.allow_theouthaven_feature ? "Feature allowed" : "No feature permission"}</AdminStatusBadge>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="No marketing assets yet" body="Campaign and approved location media will appear here after assets are added." /></div>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
