import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";
type Budget = { scope:string; scope_id:string; cap_usd:number; enabled:boolean; used_usd:number; period_start:string; period_end:string };

async function changeBudget(formData: FormData) {
  "use server";
  await requireAdminRole(["superadmin"]);
  const scope = String(formData.get("scope") || "");
  const scopeId = String(formData.get("scope_id") || "");
  const raw = String(formData.get("cap_usd") || "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!["global","campaign"].includes(scope) ||
      (scope === "global" ? scopeId !== "all" : !/^[a-zA-Z0-9:_-]{6,100}$/.test(scopeId)) ||
      !/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("Invalid acquisition budget");
  const { data, error } = await getAdminDatabaseClient().rpc("admin_li_v2_update_budget", {
    p_scope: scope, p_scope_id: scopeId, p_cap_usd: Number(raw), p_enabled: enabled,
  });
  if (error || data !== true) throw new Error(error?.message || "Budget update denied");
  revalidatePath("/admin/dashboard/settings/location-tools/campaigns");
}

async function updateProviderPrice(formData: FormData) {
  "use server";
  await requireAdminRole(["superadmin"]);
  const provider = String(formData.get("provider") || "");
  const raw = String(formData.get("max_usd") || "");
  if (!["google","dataforseo","brave","serpapi"].includes(provider) ||
      !/^\d+(\.\d{1,6})?$/.test(raw) || Number(raw) <= 0) throw new Error("Invalid provider price");
  const { data, error } = await getAdminDatabaseClient().rpc("admin_li_v2_set_provider_price", {
    p_provider: provider, p_max_usd: Number(raw),
    p_enabled: String(formData.get("enabled")) === "true",
  });
  if (error || data !== true) throw new Error(error?.message || "Provider price update denied");
  revalidatePath("/admin/dashboard/settings/location-tools/campaigns");
}

export default async function CampaignControlsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const { data, error } = await getAdminDatabaseClient().rpc("admin_li_v2_budget_snapshot");
  const rows = ((data as { caps?: Budget[] } | null)?.caps || []) as Budget[];
  const { data: priceData, error: priceError } = await getAdminDatabaseClient().rpc("li_v2_acquisition_controls_snapshot");
  const prices = ((priceData as { providers?: {provider:string;max_usd_per_request:number;enabled:boolean}[] } | null)?.providers || []);
  return <main className="min-h-screen bg-[#080407] px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/dashboard/settings/location-tools" className="text-sm font-bold text-rose-300 hover:underline">← Location Tools</Link>
      <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
        <h1 className="text-3xl font-black">Acquisition Campaign & Spending Controls</h1>
        <p className="mt-3 text-sm text-white/65">Authorized administrators manage budget amounts and stop or resume new paid reservations here. No fixed dollar ceiling is imposed by this page. Existing charges cannot be reversed by stopping a campaign.</p>
        <p className="mt-3 text-sm text-amber-200">Import-job start and cancellation are not connected to this budget panel yet; enabling a budget does not launch an import.</p>
      </section>
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 p-5 text-rose-200">Budget controls unavailable: {error.message}</p>}
      {!error && rows.length === 0 && <p>No active-period acquisition budget records exist.</p>}
      <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
        <h2 className="text-xl font-black">Provider-specific pricing safeguards</h2>
        <p className="mt-2 text-sm text-white/60">Maximum permitted estimated cost per paid request. A disabled provider price policy blocks new paid acquisitions. The runtime also requires its own configured reservation estimate.</p>
        {priceError && <p role="alert">Provider pricing controls unavailable.</p>}
        {!priceError && prices.map(price => <form key={price.provider} action={updateProviderPrice} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 p-4">
          <input type="hidden" name="provider" value={price.provider}/>
          <strong className="w-28 capitalize">{price.provider}</strong>
          <label className="text-sm">Maximum USD/request
            <input name="max_usd" type="number" required min="0.000001" step="0.000001" defaultValue={price.max_usd_per_request} className="mt-1 block w-40 rounded-lg border border-white/20 bg-black/40 p-3"/>
          </label>
          <span className="text-sm text-white/60">{price.enabled ? "Allowed" : "Blocked"}</span>
          <button name="enabled" value={String(price.enabled)} className="rounded-lg border border-white/30 px-4 py-3 text-sm">Save maximum</button>
          <button name="enabled" value="false" className="rounded-lg border border-amber-400/40 px-4 py-3 text-sm">Block</button>
          <button name="enabled" value="true" className="rounded-lg border border-emerald-400/40 px-4 py-3 text-sm">Allow</button>
        </form>)}
      </section>
      {!error && rows.map(row => <section key={row.scope+row.scope_id} className="rounded-2xl border border-white/10 bg-[#111] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">{row.scope === "global" ? "Global acquisition budget" : "Campaign: "+row.scope_id}</h2>
          <span className={row.enabled ? "text-emerald-300" : "text-amber-200"}>{row.enabled ? "Enabled" : "Stopped"}</span>
        </div>
        <p className="mt-2 text-sm text-white/65">Reserved: ${Number(row.used_usd).toFixed(2)} · Limit: ${Number(row.cap_usd).toFixed(2)}</p>
        <p className="mt-1 text-xs text-white/45">Period ends: {new Date(row.period_end).toLocaleString()}</p>
        <form action={changeBudget} className="mt-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="scope" value={row.scope}/><input type="hidden" name="scope_id" value={row.scope_id}/>
          <label className="text-sm font-bold">Budget (USD)
            <input className="mt-1 block w-40 rounded-lg border border-white/20 bg-black/40 p-3 text-white" name="cap_usd" type="number" min="0" step="0.01" required defaultValue={Number(row.cap_usd).toFixed(2)}/>
          </label>
          <button className="rounded-lg border border-white/30 px-4 py-3 text-sm font-bold" type="submit" name="enabled" value={String(row.enabled)}>Save limit</button>
          <button className="rounded-lg border border-amber-400/40 px-4 py-3 text-sm font-bold text-amber-200" type="submit" name="enabled" value="false">Stop spending</button>
          <button className="rounded-lg border border-emerald-400/40 px-4 py-3 text-sm font-bold text-emerald-200" type="submit" name="enabled" value="true">Enable spending</button>
        </form>
      </section>)}
    </div>
  </main>;
}
