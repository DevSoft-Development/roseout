import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReservationEmailPayload = { reservationId?: string; reservation_id?: string };
type LooseRecord = Record<string, any>;
function jsonResponse(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function formatDate(value?: string | null) { if (!value) return ""; try { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)); } catch { return value; } }
function formatTime(value?: string | null) { if (!value) return ""; try { const [hourRaw, minuteRaw] = value.split(":"); const hour = Number(hourRaw); const minute = Number(minuteRaw || "0"); if (Number.isNaN(hour)) return value; const date = new Date(); date.setHours(hour, minute, 0, 0); return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date); } catch { return value; } }
function escapeHtml(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  try {
    const payload = (await req.json().catch(() => ({}))) as ReservationEmailPayload;
    const reservationId = payload.reservationId || payload.reservation_id;
    if (!reservationId) return jsonResponse({ success: false, error: "reservationId is required" }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ success: false, error: "Reservation email service is not configured." }, 500);
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: reservation, error: reservationError } = await supabase.from("location_reservations").select("*").eq("id", reservationId).maybeSingle();
    if (reservationError) return jsonResponse({ success: false, error: "Could not load reservation.", details: reservationError.message || "No error message", code: reservationError.code || null, hint: reservationError.hint || null }, 500);
    if (!reservation) return jsonResponse({ success: false, error: "Reservation not found." }, 404);
    const reservationRecord = reservation as LooseRecord;
    const guestEmail = reservationRecord.guest_email || reservationRecord.customer_email || reservationRecord.email || reservationRecord.contact_email;
    if (!guestEmail) return jsonResponse({ success: false, error: "Reservation has no guest email." }, 400);
    let location: LooseRecord | null = null;
    const locationId = reservationRecord.location_id;
    if (locationId) {
      const { data: locationData } = await supabase.from("locations").select("id,name,restaurant_name,activity_name,business_name,address,city,state,zip_code,phone,email,image_url,website").eq("id", locationId).maybeSingle();
      location = (locationData || null) as LooseRecord | null;
    }
    const locationName = location?.name || location?.restaurant_name || location?.activity_name || location?.business_name || reservationRecord.location_name || reservationRecord.restaurant_name || reservationRecord.activity_name || reservationRecord.business_name || "the location";
    const guestName = reservationRecord.guest_name || reservationRecord.customer_name || reservationRecord.name || "Guest";
    const reservationDate = formatDate(reservationRecord.reservation_date || reservationRecord.date || reservationRecord.booking_date);
    const reservationTime = formatTime(reservationRecord.reservation_time || reservationRecord.time || reservationRecord.booking_time);
    const partySize = reservationRecord.party_size || reservationRecord.guests || reservationRecord.guest_count || reservationRecord.party_count || "";
    const status = reservationRecord.status || "confirmed";
    const confirmationCode = reservationRecord.confirmation_code || reservationRecord.confirmation_number || reservationRecord.claim_code || reservationRecord.id;
    const addressParts = [location?.address || reservationRecord.address, location?.city || reservationRecord.city, location?.state || reservationRecord.state, location?.zip_code || reservationRecord.zip_code].filter(Boolean);
    const locationAddress = addressParts.join(", ");
    const subject = status === "pending" ? `Reservation request received for ${locationName}` : `Reservation confirmed at ${locationName}`;
    const heading = status === "pending" ? "Your reservation request was received" : "Your reservation is confirmed";
    const intro = status === "pending" ? `${locationName} received your reservation request and will confirm shortly.` : `Your reservation at ${locationName} has been confirmed.`;
    const html = `<div style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f1713;"><div style="max-width:640px;margin:0 auto;padding:28px 16px;"><div style="background:#ffffff;border:1px solid #eadfd4;border-radius:18px;overflow:hidden;"><div style="padding:28px 28px 18px;"><p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a55;">TheOutHaven Reserve</p><h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#1f1713;">${escapeHtml(heading)}</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#5d4a3f;">${escapeHtml(intro)}</p><div style="background:#fbf8f4;border:1px solid #eee3da;border-radius:14px;padding:18px;margin:0 0 20px;"><h2 style="margin:0 0 14px;font-size:17px;color:#1f1713;">Reservation Details</h2><table style="width:100%;border-collapse:collapse;font-size:14px;color:#3a2d27;"><tr><td>Guest</td><td style="text-align:right;font-weight:700;">${escapeHtml(guestName)}</td></tr><tr><td>Location</td><td style="text-align:right;font-weight:700;">${escapeHtml(locationName)}</td></tr><tr><td>Date</td><td style="text-align:right;font-weight:700;">${escapeHtml(reservationDate)}</td></tr><tr><td>Time</td><td style="text-align:right;font-weight:700;">${escapeHtml(reservationTime)}</td></tr><tr><td>Party Size</td><td style="text-align:right;font-weight:700;">${escapeHtml(partySize)}</td></tr><tr><td>Status</td><td style="text-align:right;font-weight:700;">${escapeHtml(status)}</td></tr><tr><td>Confirmation</td><td style="text-align:right;font-weight:700;">${escapeHtml(confirmationCode)}</td></tr></table></div>${locationAddress ? `<p><strong>Address:</strong><br />${escapeHtml(locationAddress)}</p>` : ""}${reservationRecord.special_requests ? `<p><strong>Special Requests:</strong><br />${escapeHtml(reservationRecord.special_requests)}</p>` : ""}<p>If you need to make changes, please contact the location directly.</p></div><div style="padding:16px 28px;background:#1f1713;color:#f7f4ef;font-size:12px;text-align:center;">Powered by TheOutHaven Reserve</div></div></div></div>`;
    const text = `${heading}\n\n${intro}\n\nReservation Details:\nGuest: ${guestName}\nLocation: ${locationName}\nDate: ${reservationDate}\nTime: ${reservationTime}\nParty Size: ${partySize}\nStatus: ${status}\nConfirmation: ${confirmationCode}\n${locationAddress ? `Address: ${locationAddress}` : ""}\n\nPowered by TheOutHaven Reserve`.trim();
    const emailResult = await sendEmail({ to: String(guestEmail), subject, html, text, senderKey: "reservations" });
    if (!(emailResult as any).sent) return jsonResponse({ success: false, error: cleanError((emailResult as any).error) || "Email could not be sent." }, 502);
    return jsonResponse({ success: true, message: "Reservation confirmation email sent.", reservationId, to: guestEmail, provider: "aws_integration_api" });
  } catch (caughtError) {
    console.error("reservation-confirmation-email error", caughtError);
    return jsonResponse({ success: false, error: caughtError instanceof Error ? caughtError.message : "Unknown error" }, 500);
  }
});

function cleanError(value: unknown) { return typeof value === "string" ? value.slice(0, 500) : ""; }
