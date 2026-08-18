"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupportReply, createSupportTicket } from "@/lib/support";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";

async function requireLocationContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) redirect("/login");
  const location = await getCurrentBusinessLocation();
  if (!location?.id) throw new Error("No location is connected to this account.");
  return { user, location };
}

export async function createLocationSupportTicketAction(formData: FormData) {
  const { user, location } = await requireLocationContext();
  const category = String(formData.get("category") || "Location Support").trim();
  const subject = String(formData.get("subject") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!subject || !message) throw new Error("Subject and message are required.");

  const ticket = await createSupportTicket({
    name: String(location.owner_name || user.user_metadata?.full_name || location.name || "Location owner"),
    email: user.email!,
    phone: String(location.owner_phone || location.phone || ""),
    topic: category,
    subject,
    message,
    source: "location_dashboard",
  });

  const { error } = await supabaseAdmin
    .from("support_tickets")
    .update({
      user_id: user.id,
      location_id: location.id,
      requester_type: "location",
      category,
      assigned_group: category === "Billing" ? "billing" : category === "Reservations" ? "reservations" : category === "Website / Domain" || category === "Technical" ? "technical_support" : "location_success",
      metadata: {
        location_name: location.name || location.restaurant_name || location.activity_name || null,
        location_plan: location.subscription_plan || location.plan || null,
        origin: "location_dashboard",
      },
    })
    .eq("id", ticket.id);
  if (error) throw error;

  revalidatePath("/locations/dashboard/support");
  redirect(`/locations/dashboard/support?ticket=${ticket.id}`);
}

export async function replyToLocationSupportTicketAction(formData: FormData) {
  const { user, location } = await requireLocationContext();
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!ticketId || !message) throw new Error("Ticket and message are required.");

  const { data: ticket, error } = await supabaseAdmin
    .from("support_tickets")
    .select("id,public_access_token,requester_name,requester_email,status")
    .eq("id", ticketId)
    .eq("location_id", location.id)
    .maybeSingle();
  if (error) throw error;
  if (!ticket?.public_access_token) throw new Error("Support ticket not found for this location.");

  await createSupportReply({
    ticketId,
    token: ticket.public_access_token,
    actorType: "creator",
    authorName: String(location.owner_name || user.user_metadata?.full_name || ticket.requester_name || "Location owner"),
    authorEmail: user.email!,
    message,
  });

  revalidatePath("/locations/dashboard/support");
  redirect(`/locations/dashboard/support?ticket=${ticketId}`);
}
