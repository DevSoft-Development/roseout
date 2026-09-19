import { createSupportTicket } from "@/lib/support";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ticket = await createSupportTicket({
      name: body.name,
      email: body.email,
      phone: body.phone,
      topic: body.topic,
      subject: body.subject,
      message: body.message,
      source: body.source,
    });

    return Response.json({
      success: true,
      ticket,
      ticketUrl: `/support/tickets/${ticket.id}?key=${ticket.public_access_token}`,
      message: "Support ticket created.",
    });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create support ticket." },
      { status: 400 }
    );
  }
}
