import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportTicketConversation from "@/components/support/SupportTicketConversation";
import {
  getSupportTicket,
  getSupportTicketMessages,
  listSupportAdmins,
} from "@/lib/support";
import { listSupportDepartmentRoutes } from "@/lib/support-routing";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminSupportTicketPage({ params }: PageProps) {
  await requireAdminRole([
    "superuser",
    "admin",
    "editor",
    "reviewer",
    "viewer",
  ]);

  const { id } = await params;
  const ticket = await getSupportTicket(id);

  if (!ticket) notFound();

  const [messages, admins, departments] = await Promise.all([
    getSupportTicketMessages(ticket.id),
    listSupportAdmins(),
    listSupportDepartmentRoutes(),
  ]);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/dashboard/support"
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
          >
            ← Support inbox
          </Link>
          <Link
            href={`/support/tickets/${ticket.id}?key=${ticket.public_access_token}`}
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
          >
            Public ticket view
          </Link>
        </div>
        <SupportTicketConversation
          ticket={ticket}
          messages={messages}
          accessKey={ticket.public_access_token}
          adminMode
          admins={admins}
          departments={departments}
        />
      </div>
    </main>
  );
}
