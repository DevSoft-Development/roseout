import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  assignSupportTicket,
  getSupportTicket,
  getSupportTicketMessages,
  isSupportRequestAdmin,
  updateSupportTicketStatus,
} from "@/lib/support";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    const key = url.searchParams.get("key") || "";
    const ticket = await getSupportTicket(id);

    if (!ticket) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    const isAdmin = await isSupportRequestAdmin();
    if (!isAdmin && key !== ticket.public_access_token) {
      return Response.json({ error: "Invalid ticket access key." }, { status: 403 });
    }

    const messages = await getSupportTicketMessages(ticket.id);

    return Response.json({ ticket, messages });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load ticket." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);

    if (error) {
      return error;
    }

    const assignedAdminEmail = String(body.assignedAdminEmail || "").trim();
    const status = String(body.status || "").trim();
    const result = assignedAdminEmail
      ? await assignSupportTicket(id, assignedAdminEmail)
      : await updateSupportTicketStatus(id, status);

    return Response.json({ success: true, ...result });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update ticket." },
      { status: 400 }
    );
  }
}
