import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportTicketConversation from "@/components/support/SupportTicketConversation";
import { getSupportTicket, getSupportTicketMessages } from "@/lib/support";
import { supabase } from "@/lib/supabase";
import SupportTicketAssignmentForm from "@/components/admin/SupportTicketAssignmentForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminSupportTicketPage({ params }: PageProps) {
  await requireAdminRole(["superuser", "admin", "editor", "reviewer", "viewer"]);

  const { id } = await params;
  const ticket = await getSupportTicket(id);

  if (!ticket) notFound();

  const messages = await getSupportTicketMessages(ticket.id);

  const [{ data: adminUsers }, { data: routing }] = await Promise.all([
    supabase.from("admin_users").select("email").in("role", ["superuser", "admin"]),
    supabase.from("support_department_routing").select("department").eq("is_active", true),
  ]);

  const departments = Array.from(
    new Set([
      "Guest Care",
      "OutHaven Reserve",
      "Partner Success",
      ...((routing || []) as { department?: string | null }[]).map((item) => item.department || "").filter(Boolean),
    ])
  );
  const adminEmails = ((adminUsers || []) as { email?: string | null }[])
    .map((item) => item.email || "")
    .filter(Boolean);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/dashboard/support" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            ← Support inbox
          </Link>
          <Link href={`/support/tickets/${ticket.id}?key=${ticket.public_access_token}`} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            Public ticket view
          </Link>
        </div>
        <SupportTicketAssignmentForm
          ticketId={ticket.id}
          initialDepartment={ticket.department}
          initialAssignedEmail={ticket.assigned_admin_email}
          departments={departments}
          adminEmails={adminEmails}
        />
        <SupportTicketConversation ticket={ticket} messages={messages} accessKey={ticket.public_access_token} adminMode />
      </div>
    </main>
  );
}
