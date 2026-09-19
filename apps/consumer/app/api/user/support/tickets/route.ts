import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TICKET_SELECT = "id,ticket_number,subject,category,status,priority,source,related_outing_id,related_reservation_id,related_saved_plan_id,created_at,updated_at,last_message_at";

function ticketNumber() {
  return `TOH-${Date.now().toString().slice(-8)}`;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function currentUser() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  return user;
}

async function ownsRelated(userId: string, table: string, id: unknown) {
  const value = clean(id, 80);
  if (!value) return null;
  const { data } = await supabaseAdmin.from(table).select("id").eq("id", value).eq("user_id", userId).maybeSingle();
  return data?.id ? value : false;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin.from("support_tickets")
    .select(TICKET_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, error: "Could not load support tickets." }, { status: 500 });
  return NextResponse.json({ success: true, tickets: data || [] });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subject = clean(body.subject, 160);
  const message = clean(body.message, 4000);
  if (!subject || !message) return NextResponse.json({ success: false, error: "Subject and message are required." }, { status: 400 });

  const [relatedOuting, relatedReservation, relatedSavedPlan] = await Promise.all([
    ownsRelated(user.id, "outings", body.related_outing_id),
    ownsRelated(user.id, "location_reservations", body.related_reservation_id),
    ownsRelated(user.id, "saved_plans", body.related_saved_plan_id),
  ]);
  if (relatedOuting === false || relatedReservation === false || relatedSavedPlan === false) {
    return NextResponse.json({ success: false, error: "A related record could not be verified." }, { status: 400 });
  }

  const category = clean(body.category, 60) || "other";
  const { data, error } = await supabaseAdmin.from("support_tickets").insert({
    ticket_number: ticketNumber(),
    user_id: user.id,
    email: user.email || null,
    requester_email: user.email || null,
    requester_name: null,
    subject,
    category,
    status: "open",
    priority: "normal",
    source: "user_dashboard",
    related_outing_id: relatedOuting || null,
    related_reservation_id: relatedReservation || null,
    related_saved_plan_id: relatedSavedPlan || null,
  }).select(TICKET_SELECT).single();

  if (error || !data) return NextResponse.json({ success: false, error: "Could not create support ticket." }, { status: 400 });

  await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: data.id,
    direction: "inbound",
    sender_user_id: user.id,
    sender_role: "user",
    body: message,
  });

  return NextResponse.json({ success: true, ticket: data });
}
