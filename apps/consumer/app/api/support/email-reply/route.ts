import { createSupportReply, extractTicketReplyAddress } from "@/lib/support";

export const dynamic = "force-dynamic";

function pickString(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export async function POST(req: Request) {
  const secret = process.env.SUPPORT_INBOUND_SECRET;
  const providedSecret = req.headers.get("x-support-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (secret && providedSecret !== secret) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries());

    const to = pickString(body.to || body.recipient || body.To);
    const from = pickString(body.from || body.sender || body.From);
    const text = pickString(body.text || body["stripped-text"] || body.TextBody || body.body);
    const parsed = extractTicketReplyAddress(to);

    if (!parsed) {
      return Response.json({ error: "Ticket reply address not recognized." }, { status: 400 });
    }

    const reply = await createSupportReply({
      ticketId: parsed.ticketId,
      token: parsed.token,
      actorType: from.toLowerCase().includes((process.env.ADMIN_NOTIFY_EMAIL || "__admin__").toLowerCase()) ? "admin" : "creator",
      authorEmail: from,
      message: text,
    });

    return Response.json({ success: true, reply });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not process inbound email." },
      { status: 400 }
    );
  }
}
