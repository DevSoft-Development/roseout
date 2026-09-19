"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupportReply, createSupportTicket } from "@/lib/support";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

async function requireLocationContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) redirect("/login?next=/locations/dashboard/support");

  const location = await getCurrentBusinessLocation();
  if (!location?.id) throw new Error("No location is connected to this account.");

  const access = await requireOwnerOrAdminAccessToLocation(user.id, String(location.id));
  if (!access) throw new Error("You do not have access to this location.");

  return { user, location: access.location };
}

export async function createLocationSupportTicketAction(formData: FormData) {
  const { user, location } = await requireLocationContext();
  const userEmail = user.email;
  if (!userEmail) throw new Error("A verified email is required for location support.");
  const category = String(formData.get("category") || "Location Support").trim().slice(0, 80);
  const subject = String(formData.get("subject") || "").trim().slice(0, 160);
  const message = String(formData.get("message") || "").trim().slice(0, 4000);
  if (!subject || !message) throw new Error("Subject and message are required.");

  const locationName = String(location.name || location.restaurant_name || location.activity_name || "Location");
  const ticket = await createSupportTicket({
    name: locationName,
    email: userEmail,
    phone: "",
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
        location_name: locationName,
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
  const userEmail = user.email;
  if (!userEmail) throw new Error("A verified email is required for location support.");
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const message = String(formData.get("message") || "").trim().slice(0, 4000);
  if (!ticketId || !message) throw new Error("Ticket and message are required.");

  const { data: ticket, error } = await supabaseAdmin
    .from("support_tickets")
    .select("id,public_access_token,status")
    .eq("id", ticketId)
    .eq("location_id", location.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!ticket?.public_access_token) throw new Error("Support ticket not found for this location.");

  const locationName = String(location.name || location.restaurant_name || location.activity_name || "Location");
  await createSupportReply({
    ticketId,
    token: ticket.public_access_token,
    actorType: "creator",
    authorName: locationName,
    authorEmail: userEmail,
    message,
  });

  revalidatePath("/locations/dashboard/support");
  redirect(`/locations/dashboard/support?ticket=${ticketId}`);
}
