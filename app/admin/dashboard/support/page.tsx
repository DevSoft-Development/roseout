import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportTicketClient from "@/components/support/SupportTicketClient";
import { listSupportTickets } from "@/lib/support";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Experience Inbox",
  description: "Admin Experience Inbox for customer messages, claims, reservations, and billing notes.",
};

const SUPPORT_DASHBOARD_VERSION = "support-dashboard-refresh-2026-05-12";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "open").toLowerCase();
}

function isOpenStatus(status: string | null | undefined) {
  return !["closed", "resolved"].includes(normalizeStatus(status));
}

function statusClass(status: string | null | undefined) {
  const value = normalizeStatus(status);

  if (value === "closed" || value === "resolved") {
    return "bg-neutral-100 text-neutral-700";
  }

  if (value === "pending" || value === "waiting") {
    return "bg-rose-50 text-rose-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

export default async function AdminSupportPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.experienceInbox);

  const supportTickets = await listSupportTickets(75);
  const openTickets = supportTickets.filter((ticket) => isOpenStatus(ticket.status));
  const closedTickets = supportTickets.filter((ticket) => !isOpenStatus(ticket.status));
  const urgentTickets = supportTickets.filter(
    (ticket) => String(ticket.priority || "").toLowerCase() === "urgent"
  );
  const latestTicket = supportTickets[0];

  return (
    <main
      data-page-version={SUPPORT_DASHBOARD_VERSION}
      className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1400px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <div className="absolute right-[-40px] top-[-60px] h-52 w-52 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                Experience Team
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Experience Inbox
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                The restored ticket center shows the current inbox, open-ticket
                volume, urgent requests, and a quick admin ticket form in one
                dashboard view.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="#new-ticket"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg"
                >
                  Submit ticket
                </Link>
                <Link
                  href="/admin/dashboard"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Back to dashboard
                </Link>
                <Link
                  href="/support"
                  className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Public support page
                </Link>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/45">
                Inbox Snapshot
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Open
                  </p>
                  <p className="mt-1 text-3xl font-black text-emerald-300">
                    {formatNumber(openTickets.length)}
                  </p>
                </div>
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Urgent
                  </p>
                  <p className="mt-1 text-3xl font-black text-rose-200">
                    {formatNumber(urgentTickets.length)}
                  </p>
                </div>
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Closed
                  </p>
                  <p className="mt-1 text-3xl font-black text-white/70">
                    {formatNumber(closedTickets.length)}
                  </p>
                </div>
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">
                    Total
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {formatNumber(supportTickets.length)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {latestTicket && (
          <Link
            href={`/admin/dashboard/support/${latestTicket.id}`}
            className="mt-6 block rounded-[1.5rem] border border-rose-300/20 bg-rose-500/10 p-5 shadow-xl transition hover:bg-rose-500/15"
          >
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
              Latest activity
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">{latestTicket.subject}</h2>
                <p className="mt-1 text-sm text-white/50">
                  {latestTicket.requester_name || "Guest"} · {latestTicket.requester_email}
                </p>
              </div>
              <span className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide ${statusClass(latestTicket.status)}`}>
                {latestTicket.status || "open"}
              </span>
            </div>
          </Link>
        )}

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
                Inbox
              </p>
              <h2 className="mt-2 text-2xl font-black">Latest tickets</h2>
            </div>
            <Link
              href="#new-ticket"
              className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              New admin ticket
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {supportTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/admin/dashboard/support/${ticket.id}`}
                className="grid gap-3 p-5 transition hover:bg-white/[0.04] md:grid-cols-[1fr_160px_170px] md:items-center"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                    {ticket.ticket_number || ticket.id}
                  </p>
                  <h3 className="mt-1 text-lg font-black">{ticket.subject}</h3>
                  <p className="mt-1 text-sm text-white/45">
                    {ticket.requester_name || "Guest"} · {ticket.requester_email}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-2 text-center text-xs font-black uppercase tracking-wide ${statusClass(ticket.status)}`}>
                  {ticket.status || "open"}
                </span>
                <time className="text-sm font-bold text-white/45">
                  {formatDate(ticket.last_message_at || ticket.created_at)}
                </time>
              </Link>
            ))}

            {supportTickets.length === 0 && (
              <div className="p-8 text-center text-sm font-bold text-white/45">
                No Experience Inbox tickets yet.
              </div>
            )}
          </div>
        </section>

        <section id="new-ticket" className="mt-6">
          <SupportTicketClient defaultSource="admin_support" compact />
        </section>
      </div>
    </main>
  );
}
