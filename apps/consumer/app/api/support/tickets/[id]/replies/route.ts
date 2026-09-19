import { createSupportReply, isSupportRequestAdmin } from "@/lib/support";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const isAdmin = body.actorType === "admin" && (await isSupportRequestAdmin());
    const reply = await createSupportReply({
      ticketId: id,
      token: body.key,
      actorType: isAdmin ? "admin" : "creator",
      authorName: body.authorName,
      authorEmail: body.authorEmail,
      authorPhone: body.authorPhone,
      message: body.message,
    });

    return Response.json({ success: true, reply });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not add reply." },
      { status: 400 }
    );
  }
}
