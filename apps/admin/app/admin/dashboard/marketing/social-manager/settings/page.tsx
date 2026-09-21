import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function SocialManagerSettingsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const { data: settings } = await getAdminDatabaseClient().from("social_manager_settings").select("*").eq("scope", "platform").maybeSingle();
  const mode = settings?.operating_mode || "assisted";
  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="Social Manager · Governance"
      title="AI Settings"
      subtitle="Choose how much routine social work AI can handle while keeping sensitive conversations with a person."
      badge={<AdminStatusBadge tone="blue">{String(mode).replaceAll("_", " ")} mode</AdminStatusBadge>}
      actions={<AdminActionButton href="/admin/dashboard/marketing/social-manager" variant="primary">Social Manager</AdminActionButton>}
    />
  <form action="/api/admin/marketing/community/settings" method="post" className="space-y-5"><section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-semibold">How should Social Manager work?</h2><div className="mt-4 grid gap-3"><label className="rounded-2xl border border-white/10 p-4"><input type="radio" name="operating_mode" value="suggest" defaultChecked={mode === "suggest"} className="mr-3"/><span className="font-semibold">I want to approve everything</span><p className="ml-7 mt-1 text-sm text-white/50">AI prepares replies and ideas. A person sends them.</p></label><label className="rounded-2xl border border-rose-400/25 bg-rose-500/5 p-4"><input type="radio" name="operating_mode" value="assisted" defaultChecked={mode === "assisted"} className="mr-3"/><span className="font-semibold">Let AI handle simple replies</span><p className="ml-7 mt-1 text-sm text-white/50">AI can handle routine questions. Important conversations wait for a person.</p></label><label className="rounded-2xl border border-white/10 p-4"><input type="radio" name="operating_mode" value="autopilot" defaultChecked={mode === "autopilot"} className="mr-3"/><span className="font-semibold">Let AI handle most routine work</span><p className="ml-7 mt-1 text-sm text-white/50">AI handles approved routine categories while sensitive topics stay human-only.</p></label></div></section>
  <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-semibold">What can AI help with?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[["handle_basic_questions","Basic questions",settings?.handle_basic_questions],["handle_outing_requests","Outing requests",settings?.handle_outing_requests],["handle_business_questions","Business questions",settings?.handle_business_questions],["handle_creator_questions","Creator questions",settings?.handle_creator_questions],["handle_comments","Comments",settings?.handle_comments],["handle_direct_messages","Direct messages",settings?.handle_direct_messages]].map(([name,label,checked])=><label key={String(name)} className="flex items-center gap-3 rounded-xl border border-white/10 p-4"><input type="checkbox" name={String(name)} value="true" defaultChecked={Boolean(checked)}/><span className="font-medium">{String(label)}</span></label>)}</div></section>
  <section className="rounded-2xl border border-red-400/15 bg-red-500/5 p-5"><h2 className="text-xl font-semibold">Always send these to a person</h2><div className="mt-3 flex flex-wrap gap-2">{["Complaints","Payments","Legal questions","Safety concerns","Media requests","Partnership negotiations"].map((label)=><span key={label} className="rounded-full bg-red-500/10 px-3 py-1.5 text-sm text-red-100">{label}</span>)}</div><p className="mt-3 text-sm text-white/50">These protections are always on.</p></section>
  <button className="rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold">Save Settings</button></form></AdminPageShell>;
}
