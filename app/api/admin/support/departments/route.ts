import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

const DEFAULT_ROUTING = [
  { category: "General Support", department: "Guest Care" },
  { category: "Reservation Help", department: "OutHaven Reserve" },
  { category: "Location Claim", department: "Partner Success" },
  { category: "Billing", department: "Billing" },
  { category: "Technical Issue", department: "Platform Operations" },
];

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const { data, error: fetchError } = await adminSupabase()
    .from("support_department_routing")
    .select("id, category, department, admin_email, is_active")
    .order("category", { ascending: true });

  if (fetchError) {
    return NextResponse.json({ routing: DEFAULT_ROUTING, warning: fetchError.message });
  }

  return NextResponse.json({ routing: data?.length ? data : DEFAULT_ROUTING });
}

export async function PUT(request: NextRequest) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const body = await request.json();
  const routing = Array.isArray(body.routing) ? body.routing : [];

  if (!routing.length) {
    return NextResponse.json({ error: "At least one category route is required." }, { status: 400 });
  }

  const rows = routing.map((item: { category?: unknown; department?: unknown; admin_email?: unknown; is_active?: unknown }) => ({
    category: String(item.category || "").trim(),
    department: String(item.department || "").trim(),
    admin_email: String(item.admin_email || "").trim().toLowerCase() || null,
    is_active: item.is_active !== false,
  })).filter((item: { category: string; department: string }) => item.category && item.department);

  const { error: deleteError } = await adminSupabase()
    .from("support_department_routing")
    .delete()
    .neq("category", "__never__");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error: insertError } = await adminSupabase()
    .from("support_department_routing")
    .insert(rows)
    .select("id, category, department, admin_email, is_active");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, routing: data });
}
