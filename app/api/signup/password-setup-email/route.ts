import { sendNewUserPasswordSetupEmail } from "@/lib/userSignupEmail";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = clean(body.email).toLowerCase();
    const fullName = clean(body.fullName);

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    await sendNewUserPasswordSetupEmail({
      email,
      fullName,
    });

    return Response.json({ success: true });
  } catch (error: unknown) {
    console.error("Signup password setup email failed", error);

    return Response.json(
      { error: error instanceof Error ? error.message : "Could not send password setup email." },
      { status: 500 }
    );
  }
}
