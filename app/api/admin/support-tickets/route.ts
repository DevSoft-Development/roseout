import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
function ticketNumber() {
  return `TOH-${Date.now().toString().slice(-8)}`;
}

export async function GET() {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (error) return error;
  const { data, error: fetchError } = await supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(50);
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  return Response.json({ tickets: data || [] });
}

export async function POST(request: Request) {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (error) return error;
  const body = await request.json();
  const { data, error: insertError } = await supabase.from("support_tickets").insert({
    ticket_number: body.ticketNumber || ticketNumber(),
    requester_email: body.requesterEmail,
    requester_name: body.requesterName || null,
    subject: body.subject,
    status: body.status || "open",
    priority: body.priority || "normal",
    source: body.source || "email",
  }).select("*").single();
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  return Response.json({ ticket: data });
}
