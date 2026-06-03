import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import SupportTicketConversation from "@/components/support/SupportTicketConversation";
import { getSupportTicket, getSupportTicketMessages } from "@/lib/support";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminSupportTicketPage({ params }: PageProps) {
  const adminUser = await requireAdminRole(ADMIN_PAGE_ACCESS.experienceInbox);
  const canManageTicket = canAdmin(adminUser.role, "experienceInboxManage");

  const { id } = await params;
  const ticket = await getSupportTicket(id);

  if (!ticket) notFound();

  const messages = await getSupportTicketMessages(ticket.id);
  const [adminUsersResult, authUsersResult] = canManageTicket
    ? await Promise.all([
        supabaseAdmin
          .from("admin_users")
          .select("user_id, role")
          .in("role", ["superadmin", "admin", "editor", "ambassador", "experience", "viewer"]),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ])
    : [{ data: [] }, { data: { users: [] } }];

  const authUsersById = new Map((authUsersResult.data?.users || []).map((user) => [user.id, user]));
  const adminUsers = (adminUsersResult.data || [])
    .map((adminUser) => {
      const authUser = authUsersById.get(adminUser.user_id);
      const metadata = authUser?.user_metadata || {};
      const fullName =
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : null;

      return {
        email: authUser?.email ?? null,
        full_name: fullName,
        role: adminUser.role,
      };
    })
    .filter((adminUser) => adminUser.email)
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/dashboard/support" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            ← Experience Inbox
          </Link>
          <Link href={`/support/tickets/${ticket.id}?key=${ticket.public_access_token}`} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            Public ticket view
          </Link>
        </div>
        <SupportTicketConversation
          ticket={ticket}
          messages={messages}
          accessKey={ticket.public_access_token}
          adminMode
          canManageTicket={canManageTicket}
          adminUsers={adminUsers}
        />
      </div>
    </main>
  );
}
