import { requireAdminApiRole } from "@/lib/admin-api-auth";

export async function POST(req: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole([
    "superadmin",
    "admin",
    "editor",
  ]);

  if (error) return error;

  const body = await req.json();

  const { restaurant_id, note } = body;

  if (!restaurant_id || !note?.trim()) {
    return Response.json(
      { error: "Restaurant ID and note are required." },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabase
    .from("restaurant_contact_notes")
    .insert({
      restaurant_id,
      note: note.trim(),
      created_by: adminUser.email,
    });

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}