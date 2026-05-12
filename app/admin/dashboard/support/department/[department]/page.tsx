import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { listSupportTickets } from "@/lib/support";
import { listSupportDepartmentRoutes } from "@/lib/support-routing";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

type PageProps = {
  params: Promise<{ department: string }>;
};

export default async function DepartmentSupportPage({ params }: PageProps) {
  await requireAdminRole([
    "superuser",
    "admin",
    "editor",
    "reviewer",
    "viewer",
  ]);

  const { department } = await params;
  const departments = await listSupportDepartmentRoutes();
  const route = departments.find((item) => item.slug === department);

  if (!route) notFound();

  const tickets = await listSupportTickets(100, department);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/dashboard/support"
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
          >
            ← Support inbox
          </Link>
          <Link
            href="/admin/dashboard/support/routes"
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
          >
            Edit routes
          </Link>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Department
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            {route.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            {route.description || "Tickets routed to this support department."}
          </p>
          <p className="mt-4 text-sm font-bold text-white/45">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"} · Topics:{" "}
            {route.topics.join(", ") || "None"}
          </p>
        </section>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111] shadow-2xl">
          <div className="divide-y divide-white/10">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/admin/dashboard/support/${ticket.id}`}
                className="grid gap-3 p-5 transition hover:bg-white/[0.04] md:grid-cols-[1fr_180px_170px_150px] md:items-center"
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
                <span className="rounded-full bg-white/10 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-white/75">
                  {ticket.assigned_admin_email || "Unassigned"}
                </span>
                <span className="rounded-full bg-white px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-black">
                  {ticket.status || "open"}
                </span>
                <time className="text-sm font-bold text-white/45">
                  {formatDate(ticket.last_message_at || ticket.created_at)}
                </time>
              </Link>
            ))}

            {tickets.length === 0 && (
              <div className="p-8 text-center text-sm font-bold text-white/45">
                No tickets in this department.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
