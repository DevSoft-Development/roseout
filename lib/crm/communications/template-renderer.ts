import "server-only";
import type { TemplateContext } from "./types";
export const TEMPLATE_VARIABLES = new Set(["contact.first_name","contact.full_name","account.name","location.name","location.address","opportunity.name","opportunity.stage","opportunity.amount","task.title","task.due_at","reservation.date","reservation.time","claim.code","claim.url","owner.claim_url","sender.name","sender.email","company.support_email"]);
const TOKEN = /{{\s*([a-z][a-z0-9_.]*)\s*}}/gi;
export function variablesIn(value: string) { return [...value.matchAll(TOKEN)].map((match) => match[1]); }
export function validateTemplate(value: string, context: TemplateContext) {
  const unknown = variablesIn(value).filter((key) => !TEMPLATE_VARIABLES.has(key));
  const unresolved = variablesIn(value).filter((key) => context[key] === null || context[key] === undefined || context[key] === "");
  return { valid: unknown.length === 0 && unresolved.length === 0, unknown: [...new Set(unknown)], unresolved: [...new Set(unresolved)] };
}
export function renderTemplate(value: string, context: TemplateContext) {
  const result = validateTemplate(value, context);
  if (!result.valid) throw new Error(`Template variables invalid: ${[...result.unknown, ...result.unresolved].join(", ")}`);
  return value.replace(TOKEN, (_, key: string) => String(context[key]));
}
export function sanitizeHtml(value: string) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}
