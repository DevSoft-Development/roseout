import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.invite_code) {
      return Response.json(
        { error: "Invite code is required." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("restaurant_invites")
      .update({
        scanned_at: new Date().toISOString(),
        status: "scanned",
      })
      .eq("invite_code", body.invite_code);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}