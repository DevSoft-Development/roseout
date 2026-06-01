import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export async function POST(req: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);

  if (error) return error;

  try {
    const body = await req.json();

    const activityId = body.activity_id;
    const note = body.note?.trim();

    if (!activityId || !note) {
      return Response.json(
        { error: "Activity ID and note are required." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("activity_contact_notes")
      .insert({
        activity_id: activityId,
        note,
        created_by: adminUser.email,
      });

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: "Note added successfully.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Could not add note." },
      { status: 500 }
    );
  }
}
