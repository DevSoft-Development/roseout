import { resolveEmailSender, THEOUTHAVEN_BRAND } from "./brand";
import type { EmailAlertItem, EmailSection, RenderBrandedEmailInput, RenderedEmail } from "./types";
import { formatEmailValue, formatMetricValue } from "./types";

const c = THEOUTHAVEN_BRAND.colors;

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function button(cta: { label: string; url: string }, secondary = false) {
  return `<a href="${escapeHtml(cta.url)}" style="display:inline-block;border-radius:999px;padding:14px 22px;font-weight:800;font-size:14px;line-height:18px;text-decoration:none;${secondary ? `color:${c.text};border:1px solid ${c.border};background:${c.elevated};` : `color:#ffffff;background:${c.accent};border:1px solid ${c.accent};`}">${escapeHtml(cta.label)}</a>`;
}

function severityColor(severity: EmailAlertItem["severity"]) {
  if (severity === "critical") return "#ff4d5e";
  if (severity === "warning") return "#f59e0b";
  if (severity === "success") return "#22c55e";
  return c.accent;
}

function renderSectionHtml(section: EmailSection): string {
  switch (section.type) {
    case "paragraph":
      return `<p style="margin:0 0 18px;color:${c.muted};font-size:15px;line-height:24px;">${escapeHtml(section.text)}</p>`;
    case "infoList":
      return `<div style="margin:22px 0;border:1px solid ${c.border};border-radius:20px;background:${c.elevated};overflow:hidden;">${section.title ? `<div style="padding:16px 18px 0;color:${c.text};font-weight:800;font-size:16px;">${escapeHtml(section.title)}</div>` : ""}${section.items.map((item) => `<div style="padding:14px 18px;border-top:1px solid ${c.border};"><div style="color:${c.subtle};font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;">${escapeHtml(item.label)}</div><div style="margin-top:4px;color:${c.text};font-size:15px;line-height:22px;">${escapeHtml(formatEmailValue(item.value))}</div></div>`).join("")}</div>`;
    case "statGrid":
      return `<div style="margin:22px 0;">${section.title ? `<h2 style="margin:0 0 12px;color:${c.text};font-size:18px;">${escapeHtml(section.title)}</h2>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${section.metrics.map((metric) => `<td style="width:50%;padding:6px;vertical-align:top;"><div style="border:1px solid ${c.border};border-radius:18px;background:${c.elevated};padding:16px;"><div style="color:${c.subtle};font-size:12px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;">${escapeHtml(metric.label)}</div><div style="margin-top:8px;color:${c.text};font-size:24px;font-weight:900;">${escapeHtml(formatMetricValue(metric.value))}</div>${metric.detail ? `<div style="margin-top:6px;color:${c.muted};font-size:13px;line-height:18px;">${escapeHtml(metric.detail)}</div>` : ""}</div></td>`).join("")}</tr></table></div>`;
    case "alertList":
      return `<div style="margin:22px 0;">${section.title ? `<h2 style="margin:0 0 12px;color:${c.text};font-size:18px;">${escapeHtml(section.title)}</h2>` : ""}${section.alerts.length ? section.alerts.map((alert) => `<div style="margin:10px 0;border-left:4px solid ${severityColor(alert.severity)};border-radius:16px;background:${c.elevated};padding:14px 16px;"><div style="color:${c.text};font-weight:800;">${escapeHtml(alert.title)}</div>${alert.detail ? `<div style="margin-top:5px;color:${c.muted};font-size:14px;line-height:21px;">${escapeHtml(alert.detail)}</div>` : ""}${alert.url ? `<div style="margin-top:8px;"><a href="${escapeHtml(alert.url)}" style="color:${c.accent};font-weight:800;text-decoration:none;">Review item</a></div>` : ""}</div>`).join("") : `<div style="color:${c.muted};font-size:14px;">No alerts to review.</div>`}</div>`;
    case "table":
      return `<div style="margin:22px 0;overflow:hidden;border:1px solid ${c.border};border-radius:18px;">${section.title ? `<div style="padding:14px 16px;color:${c.text};font-weight:800;background:${c.elevated};">${escapeHtml(section.title)}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><thead><tr>${section.table.columns.map((col) => `<th align="left" style="padding:12px;color:${c.subtle};font-size:12px;text-transform:uppercase;letter-spacing:.1em;border-top:1px solid ${c.border};">${escapeHtml(col)}</th>`).join("")}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:12px;color:${c.muted};font-size:14px;border-top:1px solid ${c.border};">${escapeHtml(formatEmailValue(cell, "Not tracked yet"))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "divider":
      return `<div style="height:1px;background:${c.border};margin:24px 0;"></div>`;
    case "callout":
      return `<div style="margin:22px 0;border:1px solid ${severityColor(section.tone)};border-radius:18px;background:${c.softRed};padding:16px;"><div style="color:${c.text};font-weight:900;">${escapeHtml(section.title || "Note")}</div><div style="margin-top:6px;color:${c.muted};font-size:14px;line-height:22px;">${escapeHtml(section.text)}</div></div>`;
    case "timeline":
      return `<div style="margin:22px 0;">${section.title ? `<h2 style="margin:0 0 12px;color:${c.text};font-size:18px;">${escapeHtml(section.title)}</h2>` : ""}${section.items.map((item) => `<div style="padding:0 0 14px 18px;border-left:2px solid ${c.accent};"><div style="color:${c.text};font-weight:800;">${escapeHtml(item.title)}</div>${item.timestamp ? `<div style="color:${c.subtle};font-size:12px;margin-top:3px;">${escapeHtml(item.timestamp)}</div>` : ""}${item.detail ? `<div style="color:${c.muted};font-size:14px;line-height:21px;margin-top:5px;">${escapeHtml(item.detail)}</div>` : ""}</div>`).join("")}</div>`;
    case "signature":
      return `<p style="margin:24px 0 0;color:${c.muted};font-size:14px;line-height:22px;">${escapeHtml(section.text || "TheOutHaven Concierge").replace(/\n/g, "<br/>")}</p>`;
  }
}

function sectionText(section: EmailSection) {
  switch (section.type) {
    case "paragraph": return section.text;
    case "infoList": return [section.title, ...section.items.map((i) => `${i.label}: ${formatEmailValue(i.value)}`)].filter(Boolean).join("\n");
    case "statGrid": return [section.title, ...section.metrics.map((m) => `${m.label}: ${formatMetricValue(m.value)}${m.detail ? ` (${m.detail})` : ""}`)].filter(Boolean).join("\n");
    case "alertList": return [section.title, ...(section.alerts.length ? section.alerts.map((a) => `${a.title}${a.detail ? ` — ${a.detail}` : ""}`) : ["No alerts to review."])].filter(Boolean).join("\n");
    case "table": return [section.title, section.table.columns.join(" | "), ...section.table.rows.map((r) => r.map((x) => formatEmailValue(x, "Not tracked yet")).join(" | "))].filter(Boolean).join("\n");
    case "divider": return "---";
    case "callout": return `${section.title || "Note"}: ${section.text}`;
    case "timeline": return [section.title, ...section.items.map((i) => `${i.title}${i.timestamp ? ` (${i.timestamp})` : ""}${i.detail ? ` — ${i.detail}` : ""}`)].filter(Boolean).join("\n");
    case "signature": return section.text || "TheOutHaven Concierge";
  }
}

export function renderBrandedEmail(input: RenderBrandedEmailInput): RenderedEmail {
  const sender = resolveEmailSender(input.department);
  const footer = `You are receiving this email because of your TheOutHaven account, location, reservation, claim, admin access, or support activity.\n\nFor general support, contact support@theouthaven.com.\nFor reservations, contact reserve@theouthaven.com.\nFor admin-related questions, contact admin@theouthaven.com.${input.marketing ? "\n\nManage preferences or unsubscribe." : ""}`;
  const sections = input.sections || [];
  const sectionHtml = sections.map(renderSectionHtml).join("");
  const ctaHtml = input.cta || input.secondaryCta ? `<div style="margin:28px 0 8px;">${input.cta ? button(input.cta) : ""}${input.secondaryCta ? `<span style="display:inline-block;width:10px;"></span>${button(input.secondaryCta, true)}` : ""}</div>${input.cta ? `<p style="margin:12px 0 0;color:${c.subtle};font-size:12px;line-height:18px;">If the button does not work, copy and paste this link into your browser:<br/><a href="${escapeHtml(input.cta.url)}" style="color:${c.accent};word-break:break-all;">${escapeHtml(input.cta.url)}</a></p>` : ""}` : "";
  const footerNote = input.footerNote ? `<p style="margin:22px 0 0;color:${c.muted};font-size:13px;line-height:20px;">${escapeHtml(input.footerNote)}</p>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(input.subject)}</title></head><body style="margin:0;padding:0;background:${c.background};font-family:Arial,Helvetica,sans-serif;color:${c.text};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${c.background};padding:34px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border:1px solid ${c.border};border-radius:28px;overflow:hidden;background:${c.card};"><tr><td style="padding:30px 30px 22px;background:linear-gradient(135deg,#141010,#1c1614 58%,#2a0d13);border-bottom:1px solid ${c.border};"><div style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:${c.muted};font-weight:900;">${escapeHtml(THEOUTHAVEN_BRAND.domainLabel)}</div><div style="margin-top:18px;display:inline-block;border:1px solid ${c.border};border-radius:999px;background:${c.softRed};color:${c.text};font-size:12px;font-weight:800;padding:7px 11px;">${escapeHtml(input.eyebrow || sender.label)}</div><h1 style="margin:18px 0 0;color:${c.text};font-size:32px;line-height:38px;font-weight:900;">${escapeHtml(input.heading)}</h1>${input.intro ? `<p style="margin:14px 0 0;color:${c.muted};font-size:16px;line-height:25px;">${escapeHtml(input.intro)}</p>` : ""}</td></tr><tr><td style="padding:30px;">${sectionHtml}${ctaHtml}${footerNote}<div style="margin-top:28px;color:${c.muted};font-size:14px;line-height:22px;">${escapeHtml(sender.signature).replace(/\n/g, "<br/>")}</div></td></tr></table><div style="max-width:680px;margin:18px auto 0;color:${c.subtle};font-size:12px;line-height:18px;text-align:center;">${escapeHtml(footer).replace(/\n/g, "<br/>")}</div></td></tr></table></body></html>`;

  const text = [input.preview, "", input.heading, input.intro, ...sections.map(sectionText), input.cta ? `${input.cta.label}: ${input.cta.url}` : null, input.secondaryCta ? `${input.secondaryCta.label}: ${input.secondaryCta.url}` : null, input.footerNote, sender.signature, "", footer]
    .filter(Boolean)
    .map((part) => stripHtml(String(part)))
    .join("\n\n");

  return { subject: input.subject, preview: input.preview, html, text, department: input.department, recipientType: input.recipientType };
}
