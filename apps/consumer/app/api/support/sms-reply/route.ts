import { createSupportReply } from "@/lib/support";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
    const formData = await req.formData();
    const body = Object.fromEntries(formData.entries());
    const text = pickString(body.Body || body.body || body.message);
    const from = pickString(body.From || body.from);
    const match = text.match(/(?:RO-[A-Z0-9]+|ticket)\s+([a-f0-9-]{20,})\s+([a-f0-9]{24,})\s*:?\s*([\s\S]*)/i);

    if (match) {
      await createSupportReply({
        ticketId: match[1],
        token: match[2],
        authorPhone: from,
        message: match[3] || text,
      });
    } else {
      const { data: ticket } = await supabaseAdmin
        .from("support_tickets")
        .select("id, public_access_token")
        .eq("requester_phone", from)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ticket) {
        return new Response("Reply with your ticket link or open the ticket link to respond.", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      await createSupportReply({
        ticketId: ticket.id,
        token: ticket.public_access_token,
        authorPhone: from,
        message: text,
      });
    }

    return new Response("Reply added to your TheOutHaven support ticket.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: unknown) {
    return new Response(error instanceof Error ? error.message : "Could not process support reply.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
