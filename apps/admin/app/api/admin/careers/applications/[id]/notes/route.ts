import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CAREER_NOTE_FIELDS = "id,application_id,admin_id,note,visibility,created_at,updated_at" as const;
const VISIBILITIES = new Set(["internal", "shared"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const { note, visibility = "internal" } = await req.json();
    const cleanNote = typeof note === "string" ? note.trim().slice(0, 4000) : "";
    if (!cleanNote) return NextResponse.json({ error: "Please add a note." }, { status: 400 });
    const cleanVisibility = VISIBILITIES.has(String(visibility)) ? String(visibility) : "internal";

    const issue = validateNewYorkHiringText(cleanNote);
    if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("career_application_notes")
      .insert({ application_id: id, admin_id: admin.user_id, note: cleanNote, visibility: cleanVisibility })
      .select(CAREER_NOTE_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ note: data });
  } catch (error) {
    console.error("career note failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not add this note." }, { status: 500 });
  }
}
