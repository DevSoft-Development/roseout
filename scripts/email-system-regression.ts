import { resolveEmailSender } from "../lib/email/brand";
import { EMAIL_TEMPLATE_KEYS, getEmailTemplate } from "../lib/email/registry";
import { getSampleDataForTemplate } from "../lib/email/sample-data";

const expected = {
  customer_account: ["TheOutHaven.com", "hello@theouthaven.com", "support@theouthaven.com"],
  vip: ["TheOutHaven VIP", "hello@theouthaven.com", "support@theouthaven.com"],
  offers: ["TheOutHaven Offers", "hello@theouthaven.com", "support@theouthaven.com"],
  picks: ["TheOutHaven Picks", "hello@theouthaven.com", "support@theouthaven.com"],
  events: ["TheOutHaven Events", "hello@theouthaven.com", "support@theouthaven.com"],
  business_owner: ["TheOutHaven Business", "business@theouthaven.com", "business@theouthaven.com"],
  reservations: ["TheOutHaven Reservations", "reserve@theouthaven.com", "reserve@theouthaven.com"],
  support: ["TheOutHaven Support", "support@theouthaven.com", "support@theouthaven.com"],
  billing: ["TheOutHaven Billing", "support@theouthaven.com", "support@theouthaven.com"],
  security: ["TheOutHaven Security", "support@theouthaven.com", "support@theouthaven.com"],
  admin: ["TheOutHaven Admin", "admin@theouthaven.com", "admin@theouthaven.com"],
} as const;
for (const [key, [fromName, fromEmail, replyTo]] of Object.entries(expected)) {
  const sender = resolveEmailSender(key);
  if (sender.fromName !== fromName || sender.fromEmail !== fromEmail || sender.replyTo !== replyTo) throw new Error(`Sender mismatch for ${key}`);
}
for (const key of EMAIL_TEMPLATE_KEYS) {
  const email = getEmailTemplate(key, getSampleDataForTemplate());
  if (!email.subject || !email.preview || !email.html || !email.text) throw new Error(`Incomplete render for ${key}`);
  if (/\{\s*"|\[\s*\{/.test(`${email.html} ${email.text}`)) throw new Error(`Raw JSON detected for ${key}`);
  if ((email.senderKey === "vip" || email.senderKey === "offers" || email.senderKey === "picks" || email.senderKey === "events") && !/unsubscribe|preferences/i.test(`${email.html} ${email.text}`)) throw new Error(`Marketing compliance slot missing for ${key}`);
  if (key.startsWith("admin_") || key.startsWith("superadmin_")) if (email.senderKey !== "admin") throw new Error(`Admin sender mismatch for ${key}`);
  if (key.startsWith("location_") && email.senderKey === "business_owner" && resolveEmailSender(email.senderKey).fromEmail !== "business@theouthaven.com") throw new Error(`Business sender mismatch for ${key}`);
  if (key.startsWith("reservation_") && resolveEmailSender(email.senderKey).fromEmail !== "reserve@theouthaven.com") throw new Error(`Reservation sender mismatch for ${key}`);
  if (key.startsWith("user_") && resolveEmailSender(email.senderKey).fromName !== "TheOutHaven.com") throw new Error(`Customer sender mismatch for ${key}`);
}
console.log(`email system regression checks passed for ${EMAIL_TEMPLATE_KEYS.length} templates`);
