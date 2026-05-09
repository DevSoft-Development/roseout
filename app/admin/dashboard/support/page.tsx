import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportTicketClient from "@/components/support/SupportTicketClient";
import { listSupportTickets } from "@/lib/support";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Support Admin",
  description: "Manage support tickets from the TheOutHaven admin dashboard.",
  path: "/admin/dashboard/support",
  noIndex: true,
});
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function AdminSupportPage() {
  await requireAdminRole([
    "superuser",
    "admin",
    "editor",
    "reviewer",
    "viewer",
  ]);

  const supportTickets = await listSupportTickets(50);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Admin Support
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Support tickets
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            View tickets created from support pages and contact forms, submit an
            admin ticket, and reply from the dashboard or by email.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="#new-ticket"
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg"
            >
              Submit ticket
            </Link>
            <Link
              href="/support"
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              Public support page
            </Link>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111] shadow-2xl">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
              Inbox
            </p>
            <h2 className="mt-2 text-2xl font-black">Latest tickets</h2>
          </div>

          <div className="divide-y divide-white/10">
            {supportTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/admin/dashboard/support/${ticket.id}`}
                className="grid gap-3 p-5 transition hover:bg-white/[0.04] md:grid-cols-[1fr_170px_150px] md:items-center"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                    {ticket.ticket_number || ticket.id}
                  </p>
                  <h3 className="mt-1 text-lg font-black">{ticket.subject}</h3>
                  <p className="mt-1 text-sm text-white/45">
                    {ticket.requester_name} · {ticket.requester_email}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-black">
                  {ticket.status || "open"}
                </span>
                <time className="text-sm font-bold text-white/45">
                  {formatDate(ticket.last_message_at || ticket.created_at)}
                </time>
              </Link>
            ))}

            {supportTickets.length === 0 && (
              <div className="p-8 text-center text-sm font-bold text-white/45">
                No support tickets yet.
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
