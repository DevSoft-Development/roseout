import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import {
  EMAIL_TEMPLATE_GROUPS,
  EMAIL_TEMPLATE_KEYS,
  getEmailTemplate,
  listEmailTemplates,
  validateEmailTemplate,
} from "@/lib/email/registry";
import { getSampleDataForTemplate } from "@/lib/email/sample-data";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  template?: string;
  group?: string;
  sender?: string;
  q?: string;
}>;

export default async function EnterpriseEmailQaCenterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await getCurrentAdmin();

  const params = await searchParams;
  const templates = listEmailTemplates();
  const selectedKey = (
    params.template &&
    EMAIL_TEMPLATE_KEYS.includes(params.template as (typeof EMAIL_TEMPLATE_KEYS)[number])
      ? params.template
      : EMAIL_TEMPLATE_KEYS[0]
  ) as string;
  const group = params.group || "all";
  const sender = params.sender || "all";
  const q = (params.q || "").toLowerCase();

  const filtered = templates.filter(
    (template) =>
      (group === "all" || template.group === group) &&
      (sender === "all" || template.senderKey === sender) &&
      (!q || template.key.toLowerCase().includes(q)),
  );

  const rendered = getEmailTemplate(selectedKey, getSampleDataForTemplate());
  const health = EMAIL_TEMPLATE_KEYS.map(validateEmailTemplate);
  const selectedHealth = health.find((item) => item.key === selectedKey);
  const selectedTemplate = templates.find((item) => item.key === selectedKey);
  const senders = Array.from(new Set(templates.map((item) => item.senderKey)));
  const unhealthy = health.filter((item) => item.status !== "healthy").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Messaging · Quality Assurance"
        title="Enterprise Email QA Center"
        subtitle="Preview and validate TheOutHaven email templates and sender identities from the isolated Admin app."
        badge={<AdminStatusBadge tone={unhealthy ? "amber" : "green"}>{unhealthy ? `${unhealthy} templates need review` : "Template health clean"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Template filters</p>
          <h2 className="mt-1 text-xl font-black text-white">Find a message template</h2>
        </div>
        <form className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <select name="group" defaultValue={group} className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white">
            <option value="all">All groups</option>
            {Object.keys(EMAIL_TEMPLATE_GROUPS).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select name="sender" defaultValue={sender} className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white">
            <option value="all">All senders</option>
            {senders.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="Search template key" className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white placeholder:text-white/25" />
          <button type="submit" className="min-h-11 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Apply filters</button>
        </form>
      </AdminSectionCard>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <AdminSectionCard>
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Templates</p>
          </div>
          <div className="max-h-[72vh] divide-y divide-white/10 overflow-y-auto">
            {filtered.map((template) => (
              <a
                key={template.key}
                href={`?template=${encodeURIComponent(template.key)}&group=${encodeURIComponent(group)}&sender=${encodeURIComponent(sender)}&q=${encodeURIComponent(q)}`}
                className={`block px-4 py-3 transition hover:bg-white/[0.025] ${selectedKey === template.key ? "bg-rose-500/[0.07]" : ""}`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">{template.group}</p>
                <p className="mt-1 break-all text-sm font-black text-white">{template.key}</p>
                <p className="mt-1 text-xs text-white/40">{template.senderKey} · {template.recipientType}</p>
              </a>
            ))}
          </div>
        </AdminSectionCard>

        <div className="space-y-5">
          <AdminSectionCard>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Template health</p>
                <div className="mt-2"><AdminStatusBadge tone={selectedHealth?.status === "healthy" ? "green" : "amber"}>{selectedHealth?.status || "unknown"}</AdminStatusBadge></div>
                <p className="mt-2 text-xs text-white/45">{selectedHealth?.issues.length ? selectedHealth.issues.join(" · ") : "Healthy"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Sender identity</p>
                <p className="mt-2 font-black text-white">{selectedTemplate?.fromName || "Unknown"}</p>
                <p className="mt-1 text-xs text-white/45">{selectedTemplate?.fromEmail || "No sender email"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Template key</p>
                <code className="mt-2 block break-all text-xs text-rose-200">{selectedKey}</code>
              </div>
            </div>
          </AdminSectionCard>

          <section className="grid gap-5 xl:grid-cols-2">
            <AdminSectionCard>
              <div className="border-b border-white/10 px-5 py-4"><h2 className="font-black text-white">Desktop preview</h2></div>
              <div className="bg-white p-3"><iframe title="desktop email preview" srcDoc={rendered.html} className="h-[680px] w-full bg-white" /></div>
            </AdminSectionCard>
            <AdminSectionCard>
              <div className="border-b border-white/10 px-5 py-4"><h2 className="font-black text-white">Mobile + plain text</h2></div>
              <div className="space-y-4 p-3">
                <div className="mx-auto max-w-[390px] bg-white p-2"><iframe title="mobile email preview" srcDoc={rendered.html} className="h-[540px] w-full bg-white" /></div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-xs text-white/55">{rendered.text}</pre>
              </div>
            </AdminSectionCard>
          </section>

          <AdminSectionCard>
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-black text-white">Template health panel</h2></div>
            <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {health.slice(0, 24).map((item) => (
                <article key={item.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <AdminStatusBadge tone={item.status === "healthy" ? "green" : "amber"}>{item.status}</AdminStatusBadge>
                  <p className="mt-2 break-all text-xs font-bold text-white/55">{item.key}</p>
                </article>
              ))}
            </div>
          </AdminSectionCard>
        </div>
      </section>
    </AdminPageShell>
  );
}
