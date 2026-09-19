import UserDashboardShell from "@/components/user/UserDashboardShell";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import SupportClient from "./SupportClient";

export const dynamic = "force-dynamic";

const TICKET_SELECT = "id,ticket_number,subject,category,status,priority,created_at,updated_at,last_message_at";

export default async function Page() {
  const ctx = await getCurrentUserDashboardContext();
  const { data } = await supabaseAdmin.from("support_tickets")
    .select(TICKET_SELECT)
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false });

  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <h1 className="text-4xl font-black">Support</h1>
      <p className="mt-2 text-white/60">Create a ticket, view status, and reply to TheOutHaven support.</p>
      <div className="mt-6"><SupportClient tickets={data || []} /></div>
    </UserDashboardShell>
  );
}
