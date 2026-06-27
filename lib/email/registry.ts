import { EMAIL_TEMPLATE_BUILDERS, EMAIL_TEMPLATE_DEFAULTS, REQUIRED_EMAIL_TEMPLATE_KEYS, type CommonTemplateInput } from "./templates";
import type { RenderedEmail } from "./types";
import { resolveEmailSender } from "./brand";
import { getSampleDataForTemplate } from "./sample-data";

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_BUILDERS) as Array<keyof typeof EMAIL_TEMPLATE_BUILDERS>;
export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_BUILDERS;
export const EMAIL_TEMPLATE_GROUPS = REQUIRED_EMAIL_TEMPLATE_KEYS.reduce((groups, key) => {
  const group = EMAIL_TEMPLATE_DEFAULTS[key].group;
  groups[group] = [...(groups[group] || []), key as EmailTemplateKey];
  return groups;
}, {} as Record<string, EmailTemplateKey[]>);
export function isEmailTemplateKey(key: string): key is EmailTemplateKey { return key in EMAIL_TEMPLATE_BUILDERS; }
export function getEmailTemplate(key: EmailTemplateKey | string, input: CommonTemplateInput = {}): RenderedEmail {
  if (!isEmailTemplateKey(String(key))) throw new Error(`Unknown email template key: ${key}`);
  return EMAIL_TEMPLATE_BUILDERS[String(key) as EmailTemplateKey](input);
}
export function listEmailTemplates() {
  return EMAIL_TEMPLATE_KEYS.map((key) => {
    const defaults = EMAIL_TEMPLATE_DEFAULTS[key];
    const sender = resolveEmailSender(defaults.senderKey);
    return { key, ...defaults, fromName: sender.fromName, fromEmail: sender.fromEmail, replyTo: sender.replyTo };
  });
}
export function validateEmailTemplate(key: EmailTemplateKey | string) {
  const issues: string[] = [];
  try {
    const rendered = getEmailTemplate(key, getSampleDataForTemplate());
    const defaults = EMAIL_TEMPLATE_DEFAULTS[String(key)];
    if (!rendered.subject) issues.push("Missing subject");
    if (!rendered.preview) issues.push("Missing preview");
    if (!rendered.html) issues.push("HTML did not render");
    if (!rendered.text) issues.push("Text fallback did not render");
    resolveEmailSender(rendered.senderKey || defaults?.senderKey);
    if (defaults?.marketing && !/unsubscribe|preferences/i.test(`${rendered.html} ${rendered.text}`)) issues.push("Missing preference/unsubscribe slot");
    if (["admin", "business"].includes(defaults?.variant || "") && !/dashboard/i.test(`${rendered.html} ${rendered.text}`)) issues.push("Operational template should include dashboard CTA");
    if (/\{\s*"|\[\s*\{/.test(rendered.html)) issues.push("Possible raw JSON display");
  } catch (error) { issues.push(error instanceof Error ? error.message : "Template failed to render"); }
  return { key: String(key), status: issues.length ? (issues.some((i) => /failed|Unknown|HTML/.test(i)) ? "broken" : "warning") : "healthy", issues };
}
