"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  COMMUNICATION_CHILD_TABS,
  canRetryDelivery,
  hasUnresolvedTemplateVariables,
  normalizeCommunicationChildTab,
  normalizeInboxRecord,
  orderConversation,
  type CommunicationChildTab,
} from "@/lib/admin/communications-workspace";
import CrmSmsComposer from "./CrmSmsComposer";

type Template = {
  id: string;
  name?: string;
  channel?: string;
  category?: string | null;
  subject?: string | null;
  body?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type Log = {
  id: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  message?: string | null;
  to_address?: string | null;
  recipient?: string | null;
  status?: string | null;
  delivery_status?: string | null;
  direction?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  failure_reason?: string | null;
  consent_status?: string | null;
  read_at?: string | null;
  internal?: boolean | null;
};

const childLabels: Record<CommunicationChildTab, string> = {
  overview: "Overview",
  inbox: "Inbox",
  email: "Email",
  sms: "SMS",
  notifications: "Notifications",
  templates: "Templates",
  contacts: "Contacts",
  approvals: "Approvals",
  delivery: "Delivery",
  settings: "Communication Settings",
};

const senderPurposes = ["support", "reservations", "administrative", "concierge", "system notifications"];
const variables = [
  "{{location_name}}",
  "{{owner_name}}",
  "{{customer_name}}",
  "{{reservation_date}}",
  "{{reservation_time}}",
  "{{party_size}}",
  "{{claim_url}}",
  "{{claim_code}}",
  "{{reservation_url}}",
  "{{public_listing_url}}",
  "{{offer_name}}",
  "{{offer_url}}",
  "{{support_ticket_number}}",
  "{{event_date}}",
  "{{event_guest_count}}",
  "{{unsubscribe_url}}",
];

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "Unavailable";
}

function maskEmail(value?: string | null) {
  if (!value || !value.includes("@")) return "Missing";
  const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}•••@${domain}`;
}

function maskPhone(value?: string | null) {
  return value ? `•••${value.replace(/\D/g, "").slice(-4)}` : "Missing";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-lg font-black">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/60">
      <b className="block text-white">{title}</b>
      <p className="mt-1">{text}</p>
      {action ? <span className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70">{action}</span> : null}
    </div>
  );
}

function WorkspaceTable({ rows, fields }: { rows: any[]; fields: string[] }) {
  if (!rows.length) {
    return <Empty title="No records" text="Records from the existing communication, messaging, notification, reservation, claim, support, VIP, campaign, and activity-log systems will appear here." />;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-widest text-white/45">
          <tr>{fields.map((field) => <th className="px-3 py-2" key={field}>{field.replace(/([A-Z])/g, " $1")}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index} className="border-t border-white/10">
              {fields.map((field) => <td key={field} className="max-w-[220px] truncate px-3 py-3 text-white/70">{String(row[field] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CommunicationPanel({
  locationId,
  defaultEmail,
  defaultPhone,
  templates,
  logs,
  canSend,
}: {
  locationId: string;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  templates: Template[];
  logs: Log[];
  canSend: boolean;
}) {
  const searchParams = useSearchParams();
  const active = normalizeCommunicationChildTab(searchParams.get("tab"), searchParams.get("commTab"));
  const [draftBody, setDraftBody] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const inbox = useMemo(() => logs.map(normalizeInboxRecord), [logs]);
  const ordered = useMemo(() => orderConversation(logs), [logs]);
  const sent7 = logs.filter((log) => Date.now() - new Date(log.sent_at || log.created_at || 0).getTime() <= 7 * 864e5).length;
  const sent30 = logs.filter((log) => Date.now() - new Date(log.sent_at || log.created_at || 0).getTime() <= 30 * 864e5).length;
  const delivered = logs.filter((log) => ["delivered", "opened", "clicked", "replied"].includes(String(log.delivery_status || log.status).toLowerCase())).length;
  const failed = logs.filter((log) => String(log.delivery_status || log.status).toLowerCase() === "failed").length;
  const pending = logs.filter((log) => ["pending", "scheduled", "sending", "draft"].includes(String(log.delivery_status || log.status || "pending").toLowerCase())).length;
  const responses = logs.filter((log) => log.direction === "inbound").length;
  const unread = inbox.filter((item) => item.unread).length;
  const approvals = logs.filter((log) => String(log.status).toLowerCase().includes("approval")).length;
  const emailCount = logs.filter((log) => String(log.channel || "email").toLowerCase() === "email").length;
  const smsCount = logs.filter((log) => String(log.channel).toLowerCase() === "sms").length;
  const notifications = logs.filter((log) => String(log.channel).toLowerCase().includes("notification")).length;
  const base = `/admin/dashboard/crm/${locationId}?tab=communication&commTab=`;

  const kpis = [
    ["Messages sent 7D", sent7, "delivery", "Confirmed from location communication logs."],
    ["Messages sent 30D", sent30, "delivery", "Confirmed from location communication logs."],
    ["Emails sent", emailCount, "email", "Email records reused from existing logs."],
    ["SMS sent", smsCount, "sms", "Two-way CRM SMS uses the main number 516-200-0811."],
    ["Notifications", notifications, "notifications", "Generated notification records where tracked."],
    ["Delivered", delivered, "delivery", delivered ? "Confirmed delivery states." : "No confirmed deliveries or tracking unavailable."],
    ["Failed", failed, "delivery", "Permanent failures require manual remediation before retry."],
    ["Pending", pending, "approvals", "Draft, scheduled, sending, and approval-pending items."],
    ["Responses received", responses, "inbox", "Inbound records requiring review."],
    ["Unread conversations", unread, "inbox", "Unread state from inbound message read timestamps."],
    ["Awaiting approval", approvals, "approvals", "Approval queue uses existing draft/status fields."],
    ["Email consent", defaultEmail ? 1 : 0, "contacts", defaultEmail ? "Contactable email is present; consent history displayed when available." : "Unavailable: no email on this location."],
    ["SMS contact", defaultPhone ? 1 : 0, "contacts", defaultPhone ? "A phone number is present; send-time consent and do-not-contact rules are enforced server-side." : "Unavailable: no phone on this location."],
    ["Avg response time", "Unavailable", "inbox", "Partially tracked: response SLA timestamps are not present in these logs."],
    ["Delivery rate", pct(delivered, logs.length), "delivery", logs.length ? "Calculated from confirmed delivered / total records." : "Unavailable because there is no activity."],
    ["Email open rate", pct(logs.filter((log) => log.opened_at).length, emailCount), "email", "Unavailable when open tracking is disabled or not returned."],
    ["Email click rate", pct(logs.filter((log) => log.clicked_at).length, emailCount), "email", "Unavailable when link tracking is disabled or not returned."],
    ["SMS delivery rate", pct(logs.filter((log) => String(log.channel).toLowerCase() === "sms" && log.delivered_at).length, smsCount), "sms", "Based on Telnyx delivery webhooks."],
  ];

  const recommendations = [
    unread ? ["High", "Reply to unread owner message", "Inbound unread conversation exists.", defaultEmail || defaultPhone || "Location owner", "Email/SMS", "crmEdit", "Partner", `${base}inbox`, "Open"] : null,
    failed ? ["High", "Resolve a failed message", "Delivery failure requires review before safe retry.", "Affected contact", "Email/SMS", "crmEdit", "Partner", `${base}delivery`, "Open"] : null,
    !defaultEmail ? ["Medium", "Add a missing email address", "Owner outreach cannot proceed by email without a verified recipient.", "Location owner", "Email", "crmEdit", "Partner", `${base}contacts`, "Open"] : null,
    !defaultPhone ? ["Medium", "Add a missing phone number", "SMS cannot be sent without a valid recipient.", "Location owner", "SMS", "crmEdit", "Partner + SMS", `${base}contacts`, "Open"] : null,
    !templates.length ? ["Medium", "Create owner onboarding template", "No reusable location templates are available.", "Owner prospect", "Email", "crmEdit", "Partner", `${base}templates`, "Open"] : null,
    ["Low", "Complete communication settings", "Validate sender, quiet hours, approval, retry, SLA, and compliance defaults.", "Internal team", "Settings", "admin", "Included", `${base}settings`, "Incomplete"],
  ].filter(Boolean) as string[][];

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="communications-title">
      <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Enterprise Communications Workspace</p>
        <h2 id="communications-title" className="mt-2 text-2xl font-black">{childLabels[active]}</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Location-scoped command center for who was contacted, why, channel, consent, delivery, response needs, approvals, and next steps. CRM SMS is sent manually from 516-200-0811 and inbound replies return to the CRM thread.
        </p>
        <nav aria-label="Communications workspace" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {COMMUNICATION_CHILD_TABS.map((tab) => (
            <Link
              key={tab}
              href={`${base}${tab}`}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-rose-300/50 ${active === tab ? "border-rose-300/50 bg-rose-500/20 text-rose-50" : "border-white/10 bg-white/[0.04] text-white/65"}`}
            >
              {childLabels[tab]}
            </Link>
          ))}
        </nav>
      </div>

      {active === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map(([label, value, target, help]) => (
              <Link key={String(label)} href={`${base}${target}`} title={String(help)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-rose-300/40 focus:outline-none focus:ring-2 focus:ring-rose-300/40">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
                <p className="mt-2 text-2xl font-black text-white">{String(value)}</p>
                <p className="mt-2 text-xs text-white/45">{help}</p>
              </Link>
            ))}
          </div>
          <Card title="Recommended Actions">
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recommendations.map((recommendation) => (
                <Link key={recommendation[1]} href={recommendation[7]} className="rounded-2xl border border-white/10 bg-black/25 p-4 focus:outline-none focus:ring-2 focus:ring-rose-300/40">
                  <b className="text-rose-100">{recommendation[0]} priority</b>
                  <p className="mt-1 font-black">{recommendation[1]}</p>
                  <p className="mt-1 text-sm text-white/60">Reason: {recommendation[2]}</p>
                  <p className="mt-2 text-xs text-white/45">Recipient: {recommendation[3]} · Channel: {recommendation[4]} · Permission: {recommendation[5]} · Plan: {recommendation[6]} · State: {recommendation[8]}</p>
                </Link>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {active === "inbox" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card title="Unified Inbox">
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-white/60">
              {["Channel", "Contact type", "Unread", "Assigned team member", "Status", "Priority", "Related record type", "Date range", "Response overdue", "Delivery failed", "Consent issue"].map((filter) => <span className="rounded-full border border-white/10 px-3 py-2" key={filter}>{filter}</span>)}
            </div>
            <WorkspaceTable rows={inbox} fields={["contactName", "contactType", "preview", "channel", "direction", "status", "unread", "priority", "assignedTo", "relatedRecord", "lastMessageTime", "responseDueTime", "consentStatus", "deliveryStatus"]} />
            <p className="mt-3 text-xs text-white/45">SMS replies to the main number are attached to the most recent matching CRM SMS conversation and marked unread.</p>
          </Card>
          <Card title="Conversation Thread">
            <ul className="mt-4 space-y-3">
              {ordered.map((message, index) => (
                <li key={message.id || index} className={`rounded-2xl border p-4 ${message.internal ? "border-amber-300/30 bg-amber-500/10" : "border-white/10 bg-black/25"}`}>
                  <span className="text-xs font-black uppercase tracking-widest text-white/45">{message.internal ? "Internal note — not customer visible" : (message.direction || "outgoing")} · {message.channel || "email"}</span>
                  <p className="mt-2 font-black">{message.subject || message.recipient || "Message"}</p>
                  <p className="mt-1 text-sm text-white/65">{message.body || message.message || "No body stored."}</p>
                  <p className="mt-2 text-xs text-white/45">{formatDate(message.created_at || message.sent_at)} · Delivery: {message.delivery_status || message.status || "pending"} · Consent at send: {message.consent_status || "not tracked"}</p>
                </li>
              ))}
            </ul>
            {!ordered.length ? <Empty title="No conversations" text="Owner emails, customer email, SMS, claim, event lead, reservation, waitlist, support, VIP, campaign replies, and internal notes appear here without duplicating source records." action={canSend ? "Compose Message" : undefined} /> : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-white/60">
              {["Reply", "Reply with AI draft", "Add internal note", "Assign", "Change priority", "Mark read/unread", "Resolve", "Reopen", "Link record", "Open contact", "Copy message", "View delivery"].map((action) => <span key={action} className="rounded-full border border-white/10 px-3 py-2">{action}</span>)}
            </div>
          </Card>
        </section>
      ) : null}

      {active === "email" ? (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card title="Email Composer">
            <div className="mt-4 grid gap-3">
              <input aria-label="Subject" value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} placeholder="Subject" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3" />
              <textarea aria-label="Message body" rows={8} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Draft editable copy. AI output is never sent automatically." className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3" />
              <p className="text-xs text-white/55">Variables unresolved: {hasUnresolvedTemplateVariables(draftSubject + draftBody) ? "yes — sending blocked" : "no"}.</p>
              <div className="flex flex-wrap gap-2">
                {["Generate editable AI draft", "Preview", "Send test", "Save draft", "Submit for approval", "Schedule after validation"].map((action) => <button disabled={!canSend} type="button" key={action} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black disabled:opacity-40">{action}</button>)}
              </div>
            </div>
          </Card>
          <Card title="Email Records">
            <WorkspaceTable rows={logs.filter((log) => String(log.channel || "email").toLowerCase() === "email")} fields={["recipient", "to_address", "subject", "status", "sent_at", "delivered_at", "opened_at", "clicked_at", "failure_reason"]} />
          </Card>
        </section>
      ) : null}

      {active === "sms" ? <CrmSmsComposer locationId={locationId} defaultPhone={defaultPhone} canSend={canSend} logs={logs} /> : null}

      {active === "notifications" ? (
        <Card title="Notifications and Rules">
          <WorkspaceTable rows={logs.filter((log) => String(log.channel).includes("notification"))} fields={["subject", "recipient", "status", "created_at", "delivery_status"]} />
          <p className="mt-4 text-sm text-white/60">Rules support trigger, recipient, channel, severity, delay, quiet hours, escalation, repeat behavior, enabled state, and idempotency keys so the same event/rule cannot create duplicates.</p>
        </Card>
      ) : null}

      {active === "templates" ? (
        <Card title="Unified Templates Library">
          <WorkspaceTable rows={templates} fields={["name", "channel", "category", "status", "updated_at"]} />
          <p className="mt-4 text-sm text-white/60">Template editor supports variable picker, sample preview, validation, test rendering, duplicate-variable detection, broken-link checks, character and SMS segment counts, and version history before edits replace active content.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">{variables.map((variable) => <code className="rounded-full bg-black/30 px-2 py-1" key={variable}>{variable}</code>)}</div>
        </Card>
      ) : null}

      {active === "contacts" ? (
        <Card title="Communication Contacts">
          <WorkspaceTable rows={[{
            name: "Location owner",
            contactType: "Owner",
            email: maskEmail(defaultEmail),
            phone: maskPhone(defaultPhone),
            emailConsent: defaultEmail ? "transactional available when policy permits" : "missing",
            smsConsent: "validated server-side at send time",
            optOutStatus: "Telnyx STOP synchronized to CRM contact",
            preferredChannel: defaultEmail ? "email" : defaultPhone ? "sms" : "unknown",
            lastContact: inbox[0]?.lastMessageTime || null,
          }]} fields={["name", "contactType", "email", "phone", "emailConsent", "smsConsent", "optOutStatus", "preferredChannel", "lastContact"]} />
          <p className="mt-4 text-sm text-white/60">SMS STOP/START events are verified by the Telnyx webhook and synchronized to the CRM contact before future sends are allowed.</p>
        </Card>
      ) : null}

      {active === "approvals" ? (
        <Card title="Approval Queue">
          <WorkspaceTable rows={logs.filter((log) => String(log.status).toLowerCase().includes("approval"))} fields={["subject", "channel", "recipient", "created_at", "status"]} />
          <p className="mt-4 text-sm text-white/60">Rejecting or requesting changes requires a reason. Authors cannot bypass required approval; server actions and APIs must enforce the same role, plan, sender, consent, and risk checks shown in the UI.</p>
        </Card>
      ) : null}

      {active === "delivery" ? (
        <Card title="Delivery and Failure Monitoring">
          <WorkspaceTable rows={logs.map((log) => ({ ...log, retryEligibility: canRetryDelivery(log) ? "safe after manual review" : "blocked/permanent or not failed" }))} fields={["id", "channel", "recipient", "status", "delivery_status", "created_at", "sent_at", "delivered_at", "failure_reason", "retryEligibility"]} />
          <p className="mt-4 text-sm text-white/60">Never retry permanent failures automatically. Invalid recipients, opted-out contacts, missing consent, unresolved variables, suppressed recipients, and sender issues require correction before a new idempotent send attempt.</p>
        </Card>
      ) : null}

      {active === "settings" ? (
        <Card title="Communication Settings">
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {["Default email sender", "Default SMS sender · 516-200-0811", "Default reply-to", "Owner outreach sender", "Reservation sender", "Support sender", "Notification recipients", "Approval requirements", "Quiet hours", "Default language", "Preference behavior", "Email tracking", "Link tracking", "SMS compliance text", "Unsubscribe behavior", "Retry policy", "Assignment rules", "Response SLA", "Escalation rules", "Template defaults"].map((setting) => (
              <div key={setting} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <b>{setting}</b>
                <p className="mt-1 text-xs text-white/45">Plan and permission gated. Provider credentials are never exposed.</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-white/60">CRM two-way SMS is isolated on the main number 516-200-0811. Other sender identities remain centralized by purpose ({senderPurposes.join(", ")}).</p>
        </Card>
      ) : null}
    </section>
  );
}
