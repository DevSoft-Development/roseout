import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
const DEFAULT_TEMPLATES = [
  { name: "Claim QR Code", channel: "email", subject: "Your TheOutHaven claim QR code", body: "Hi {{name}},\n\nHere is your claim QR code and instructions...", category: "claims", is_system: true },
  { name: "Welcome Business Owner", channel: "email", subject: "Welcome to TheOutHaven", body: "Hi {{name}},\n\nWelcome to TheOutHaven...", category: "onboarding", is_system: true },
  { name: "Reservation Help", channel: "email", subject: "Help with your reservation", body: "Hi {{name}},\n\nWe can help with your reservation...", category: "reservations", is_system: true },
  { name: "Profile Update Request", channel: "email", subject: "Please review your profile details", body: "Hi {{name}},\n\nPlease review your profile...", category: "profile", is_system: true },
  { name: "TheOutHaven Partner Plan Offer", channel: "email", subject: "Activate TheOutHaven Partner Plan", body: "Hi {{name}},\n\nActivate Partner Plan...", category: "sales", is_system: true },
  { name: "Support Ticket Reply", channel: "email", subject: "Update from TheOutHaven Support", body: "Hi {{name}},\n\nWe have an update on your ticket...", category: "support", is_system: true },
  { name: "Partnership Outreach", channel: "email", subject: "Partnership opportunity with TheOutHaven", body: "Hi {{name}},\n\nWe'd love to partner...", category: "partnership", is_system: true },
  { name: "Claim Reminder", channel: "sms", body: "TheOutHaven: Friendly reminder to claim your listing.", category: "claims", is_system: true },
  { name: "Reservation Reminder", channel: "sms", body: "TheOutHaven: Reminder about your reservation.", category: "reservations", is_system: true },
  { name: "Support Follow-up", channel: "sms", body: "TheOutHaven Support: We are reviewing your request.", category: "support", is_system: true },
  { name: "Profile Update Needed", channel: "sms", body: "TheOutHaven: Please update your profile details.", category: "profile", is_system: true },
  { name: "Upgrade Opportunity", channel: "sms", body: "TheOutHaven: Your account is eligible for an upgrade.", category: "sales", is_system: true },
] as const;

export async function GET() {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.communication);
  if (error) return error;

  const { data, error: fetchError } = await supabase.from("communication_templates").select("*").order("created_at", { ascending: false });
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  if (!data?.length) {
    await supabase.from("communication_templates").insert(DEFAULT_TEMPLATES);
    const { data: seeded } = await supabase.from("communication_templates").select("*").order("created_at", { ascending: false });
    return Response.json({ templates: seeded || [] });
  }

  return Response.json({ templates: data });
}

export async function POST(request: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.communication);
  if (error) return error;
  const body = await request.json();

  const payload = {
    name: body.name,
    channel: body.channel,
    subject: body.subject || null,
    body: body.body,
    category: body.category || "custom",
    is_system: false,
    created_by: adminUser?.user_id || null,
  };

  const { data, error: insertError } = await supabase.from("communication_templates").insert(payload).select("*").single();
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  return Response.json({ template: data });
}
