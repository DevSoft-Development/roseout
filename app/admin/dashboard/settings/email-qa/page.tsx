import { EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_GROUPS, listEmailTemplates, validateEmailTemplate } from "@/lib/email/registry";
import { getEmailTemplate } from "@/lib/email/registry";
import { getSampleDataForTemplate } from "@/lib/email/sample-data";

export const dynamic = "force-dynamic";

export default function EnterpriseEmailQaCenterPage({ searchParams }: { searchParams?: { template?: string; group?: string; sender?: string; q?: string } }) {
  const templates = listEmailTemplates();
  const selectedKey = (searchParams?.template && EMAIL_TEMPLATE_KEYS.includes(searchParams.template as any) ? searchParams.template : EMAIL_TEMPLATE_KEYS[0]) as string;
  const group = searchParams?.group || "all";
  const sender = searchParams?.sender || "all";
  const q = (searchParams?.q || "").toLowerCase();
  const filtered = templates.filter((t) => (group === "all" || t.group === group) && (sender === "all" || t.senderKey === sender) && (!q || t.key.toLowerCase().includes(q)));
  const rendered = getEmailTemplate(selectedKey, getSampleDataForTemplate());
  const health = EMAIL_TEMPLATE_KEYS.map(validateEmailTemplate);
  const selectedHealth = health.find((h) => h.key === selectedKey);
  const senders = Array.from(new Set(templates.map((t) => t.senderKey)));
  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-[#141010] p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">Admin settings</p>
        <h1 className="mt-2 text-3xl font-black">Enterprise Email QA Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/70">Preview, test, and monitor TheOutHaven email templates, sender identities, delivery logs, and template health.</p>
      </div>
      <form className="grid gap-3 rounded-3xl border border-white/10 bg-[#120d0b] p-4 md:grid-cols-4">
        <select name="group" defaultValue={group} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm"><option value="all">All groups</option>{Object.keys(EMAIL_TEMPLATE_GROUPS).map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select name="sender" defaultValue={sender} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm"><option value="all">All senders</option>{senders.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <input name="q" defaultValue={q} placeholder="Search template key" className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm" />
        <button className="rounded-2xl bg-[#e1062a] px-4 py-3 text-sm font-black">Apply filters</button>
      </form>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className="max-h-[760px] overflow-auto rounded-3xl border border-white/10 bg-[#120d0b] p-3">
          {filtered.map((t) => <a key={t.key} href={`?template=${t.key}&group=${group}&sender=${sender}&q=${q}`} className={`mb-2 block rounded-2xl border p-3 text-sm ${selectedKey === t.key ? "border-[#e1062a] bg-[#e1062a]/10" : "border-white/10 bg-black/20"}`}><span className="font-mono text-xs text-white/60">{t.group}</span><div className="mt-1 break-all font-bold">{t.key}</div><div className="mt-1 text-xs text-white/50">{t.senderKey} · {t.recipientType}</div></a>)}
        </section>
        <section className="space-y-5 overflow-hidden">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><p className="text-xs uppercase text-white/50">Template health</p><p className="mt-2 text-xl font-black capitalize">{selectedHealth?.status}</p><ul className="mt-2 text-xs text-white/60">{selectedHealth?.issues.length ? selectedHealth.issues.map((i) => <li key={i}>• {i}</li>) : <li>• Healthy</li>}</ul></div>
            <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><p className="text-xs uppercase text-white/50">Sender identity</p><p className="mt-2 font-black">{templates.find((t) => t.key === selectedKey)?.fromName}</p><p className="text-xs text-white/60">{templates.find((t) => t.key === selectedKey)?.fromEmail}</p></div>
            <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><p className="text-xs uppercase text-white/50">Operations</p><p className="mt-2 text-sm text-white/70">Copy template key, preview HTML, or POST to send-test API for provider wiring.</p><code className="mt-2 block break-all rounded-xl bg-black/30 p-2 text-xs">{selectedKey}</code></div>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><h2 className="font-black">Desktop preview</h2><iframe title="desktop email preview" srcDoc={rendered.html} className="mt-3 h-[620px] w-full rounded-2xl bg-white" /></div>
            <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><h2 className="font-black">Mobile + plain text</h2><iframe title="mobile email preview" srcDoc={rendered.html} className="mx-auto mt-3 h-[520px] w-[360px] max-w-full rounded-2xl bg-white" /><pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/40 p-4 text-xs text-white/70">{rendered.text}</pre></div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#141010] p-4"><h2 className="font-black">Template health panel</h2><div className="mt-3 grid gap-2 md:grid-cols-3">{health.slice(0, 24).map((h) => <div key={h.key} className="rounded-2xl border border-white/10 bg-black/20 p-3"><span className="text-xs font-black uppercase text-[#e1062a]">{h.status}</span><p className="break-all text-xs text-white/70">{h.key}</p></div>)}</div></div>
        </section>
      </div>
    </div>
  </main>;
}
