import "./email-qa.css";

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
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

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

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Settings · Messaging"
        title="Enterprise Email QA Center"
        subtitle="Preview and validate TheOutHaven email templates and sender identities from the isolated Admin app."
        badge={<AdminStatusBadge tone={selectedHealth?.status === "healthy" ? "green" : "amber"}>{selectedHealth?.status || "Template health unknown"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />
      <section className="email-qa-page">

      <form className="email-qa-filters">
        <select name="group" defaultValue={group}>
          <option value="all">All groups</option>
          {Object.keys(EMAIL_TEMPLATE_GROUPS).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select name="sender" defaultValue={sender}>
          <option value="all">All senders</option>
          {senders.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <input name="q" defaultValue={q} placeholder="Search template key" />
        <button type="submit">Apply filters</button>
      </form>

      <div className="email-qa-layout">
        <aside className="email-qa-list">
          {filtered.map((template) => (
            <a
              key={template.key}
              href={`?template=${encodeURIComponent(template.key)}&group=${encodeURIComponent(group)}&sender=${encodeURIComponent(sender)}&q=${encodeURIComponent(q)}`}
              className={selectedKey === template.key ? "selected" : ""}
            >
              <small>{template.group}</small>
              <strong>{template.key}</strong>
              <span>
                {template.senderKey} · {template.recipientType}
              </span>
            </a>
          ))}
        </aside>

        <main className="email-qa-main">
          <section className="email-qa-summary">
            <article>
              <small>Template health</small>
              <strong>{selectedHealth?.status || "unknown"}</strong>
              <span>
                {selectedHealth?.issues.length
                  ? selectedHealth.issues.join(" · ")
                  : "Healthy"}
              </span>
            </article>

            <article>
              <small>Sender identity</small>
              <strong>{selectedTemplate?.fromName || "Unknown"}</strong>
              <span>{selectedTemplate?.fromEmail || "No sender email"}</span>
            </article>

            <article>
              <small>Template key</small>
              <code>{selectedKey}</code>
            </article>
          </section>

          <section className="email-qa-previews">
            <article>
              <h2>Desktop preview</h2>
              <iframe title="desktop email preview" srcDoc={rendered.html} />
            </article>

            <article>
              <h2>Mobile preview</h2>
              <iframe
                title="mobile email preview"
                srcDoc={rendered.html}
                className="mobile"
              />
              <h3>Plain text</h3>
              <pre>{rendered.text}</pre>
            </article>
          </section>

          <section className="email-qa-health">
            <h2>Template health panel</h2>
            <div>
              {health.slice(0, 24).map((item) => (
                <article key={item.key}>
                  <b>{item.status}</b>
                  <span>{item.key}</span>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </section>
    </AdminPageShell>
  );
}
