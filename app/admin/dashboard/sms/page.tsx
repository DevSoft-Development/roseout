import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SMS Operations | TheOutHaven Admin",
  description: "SMS templates, logs, readiness, and compliance operations.",
};

type Row = Record<string, any>;

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

async function safeRows(
  table: string,
  columns = "*",
  limit = 200,
  channelSms = false,
) {
  let query = supabaseAdmin.from(table).select(columns).limit(limit);
  if (channelSms) query = query.eq("channel", "sms");
  const result = await query;
  if (result.error) return [] as Row[];
  return (result.data || []) as Row[];
}

function isLast7Days(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function phoneReady(row: Row) {
  const phone =
    row.phone || row.customer_phone || row.owner_phone || row.business_phone;
  return typeof phone === "string" && phone.replace(/\D/g, "").length >= 10;
}

export default async function SmsOperationsPage() {
  await requireAdminRole(
    ADMIN_PAGE_ACCESS.sms || ADMIN_PAGE_ACCESS.communication,
  );

  const [templates, logs, ownerAccounts, businesses, locations] =
    await Promise.all([
      safeRows(
        "communication_templates",
        "id,name,slug,channel,body,content,is_active,updated_at,created_at",
        200,
        true,
      ),
      safeRows(
        "communication_logs",
        "id,to_phone,recipient_phone,channel,status,error_message,created_at,template_name,template_id,message,body",
        300,
        true,
      ),
      safeRows(
        "owner_accounts",
        "id,email,phone,owner_phone,name,created_at",
        300,
      ),
      safeRows(
        "businesses",
        "id,name,business_name,phone,business_phone,owner_phone,created_at",
        300,
      ),
      safeRows(
        "locations",
        "id,name,restaurant_name,activity_name,phone,created_at",
        300,
      ),
    ]);

  const smsReadyContacts = [
    ...ownerAccounts,
    ...businesses,
    ...locations,
  ].filter(phoneReady);
  const last7Logs = logs.filter((row) => isLast7Days(row.created_at));
  const failedLast7 = last7Logs.filter(
    (row) =>
      String(row.status || "")
        .toLowerCase()
        .includes("fail") || row.error_message,
  );
  const recentLogs = [...logs]
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime(),
    )
    .slice(0, 12);

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">
            Marketing
          </p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">SMS Operations</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/60">
                Review SMS readiness, templates, recent delivery logs, and
                compliance before any campaigns are sent.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/dashboard/marketing"
                className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
              >
                Marketing Center
              </Link>
              <Link
                href="/admin/dashboard/campaigns"
                className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white"
              >
                Campaigns
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="SMS-ready contacts" value={smsReadyContacts.length} />
          <Metric label="SMS templates" value={templates.length} />
          <Metric label="SMS sent last 7 days" value={last7Logs.length} />
          <Metric label="Failed last 7 days" value={failedLast7.length} />
        </section>

        <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold leading-6 text-amber-100">
          Compliance notice: only text opted-in contacts, honor STOP/HELP
          replies, and include clear opt-out language in campaign copy. This
          page is read-only and does not send SMS.
        </div>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="Recent SMS logs">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/45">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Template</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {recentLogs.map((row) => (
                    <tr key={row.id || `${row.created_at}-${row.to_phone}`}>
                      <td className="px-4 py-3 text-white/60">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.to_phone || row.recipient_phone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.status || (row.error_message ? "failed" : "sent")}
                      </td>
                      <td className="px-4 py-3">
                        {row.template_name || row.template_id || "—"}
                      </td>
                    </tr>
                  ))}
                  {!recentLogs.length ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-white/50"
                      >
                        No SMS logs found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="SMS templates">
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id || template.slug || template.name}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <b>
                      {template.name || template.slug || "Untitled template"}
                    </b>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">
                      {template.is_active === false ? "inactive" : "active"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-white/55">
                    {template.body ||
                      template.content ||
                      "No template body available."}
                  </p>
                </div>
              ))}
              {!templates.length ? (
                <p className="text-sm text-white/50">
                  No SMS templates found. Create templates in the communication
                  center before sending campaigns.
                </p>
              ) : null}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{formatNumber(value)}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
