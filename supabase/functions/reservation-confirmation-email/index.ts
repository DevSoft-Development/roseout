import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReservationEmailPayload = {
  reservationId?: string;
  reservation_id?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function formatDate(value?: string | null) {
  if (!value) return "";

  try {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return value;
  }
}

function formatTime(value?: string | null) {
  if (!value) return "";

  try {
    const [hourRaw, minuteRaw] = value.split(":");
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw || "0");

    if (Number.isNaN(hour)) return value;

    const date = new Date();
    date.setHours(hour, minute, 0, 0);

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as ReservationEmailPayload;
    const reservationId = payload.reservationId || payload.reservation_id;

    if (!reservationId) {
      return jsonResponse(
        { success: false, error: "reservationId is required" },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("RESERVATION_EMAIL_FROM") ||
      "TheOutHaven Reserve <reservations@theouthaven.com>";

    console.log("reservation-confirmation-email debug", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasResendApiKey: Boolean(resendApiKey),
      reservationId,
    });

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: "Reservation email service is not configured." },
        500,
      );
    }

    if (!resendApiKey) {
      return jsonResponse(
        { success: false, error: "Email provider is not configured." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: reservation, error: reservationError } = await supabase
      .from("location_reservations")
      .select("*")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      console.error("Reservation lookup error", reservationError);

      return jsonResponse(
        {
          success: false,
          error: "Could not load reservation.",
          details: reservationError.message,
          code: reservationError.code,
          hint: reservationError.hint,
        },
        500,
      );
    }

    if (!reservation) {
      return jsonResponse(
        { success: false, error: "Reservation not found." },
        404,
      );
    }

    const guestEmail =
      reservation.guest_email ||
      reservation.customer_email ||
      reservation.email ||
      reservation.contact_email;

    if (!guestEmail) {
      return jsonResponse(
        { success: false, error: "Reservation has no guest email." },
        400,
      );
    }

    let location: Record<string, unknown> | null = null;
    const locationId = reservation.location_id;

    if (locationId) {
      const { data: locationData, error: locationError } = await supabase
        .from("locations")
        .select("id,name,restaurant_name,activity_name,business_name,address,city,state,zip_code,phone,email,image_url,website")
        .eq("id", locationId)
        .maybeSingle();

      if (locationError) {
        console.warn("Location lookup failed, continuing with reservation data", locationError);
      }

      location = locationData;
    }

    const locationName =
      location?.name ||
      location?.restaurant_name ||
      location?.activity_name ||
      location?.business_name ||
      reservation.location_name ||
      reservation.restaurant_name ||
      reservation.activity_name ||
      reservation.business_name ||
      "the location";

    const guestName =
      reservation.guest_name ||
      reservation.customer_name ||
      reservation.name ||
      "Guest";

    const reservationDate = formatDate(
      reservation.reservation_date ||
        reservation.date ||
        reservation.booking_date,
    );

    const reservationTime = formatTime(
      reservation.reservation_time ||
        reservation.time ||
        reservation.booking_time,
    );

    const partySize =
      reservation.party_size ||
      reservation.guests ||
      reservation.guest_count ||
      reservation.party_count ||
      "";

    const status = reservation.status || "confirmed";

    const confirmationCode =
      reservation.confirmation_code ||
      reservation.confirmation_number ||
      reservation.claim_code ||
      reservation.id;

    const addressParts = [
      location?.address || reservation.address,
      location?.city || reservation.city,
      location?.state || reservation.state,
      location?.zip_code || reservation.zip_code,
    ].filter(Boolean);

    const locationAddress = addressParts.join(", ");

    const subject =
      status === "pending"
        ? `Reservation request received for ${locationName}`
        : `Reservation confirmed at ${locationName}`;

    const heading =
      status === "pending"
        ? "Your reservation request was received"
        : "Your reservation is confirmed";

    const intro =
      status === "pending"
        ? `${locationName} received your reservation request and will confirm shortly.`
        : `Your reservation at ${locationName} has been confirmed.`;

    const html = `
      <div style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f1713;">
        <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
          <div style="background:#ffffff;border:1px solid #eadfd4;border-radius:18px;overflow:hidden;">
            <div style="padding:28px 28px 18px;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a55;">
                TheOutHaven Reserve
              </p>

              <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#1f1713;">
                ${escapeHtml(heading)}
              </h1>

              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#5d4a3f;">
                ${escapeHtml(intro)}
              </p>

              <div style="background:#fbf8f4;border:1px solid #eee3da;border-radius:14px;padding:18px;margin:0 0 20px;">
                <h2 style="margin:0 0 14px;font-size:17px;color:#1f1713;">
                  Reservation Details
                </h2>

                <table style="width:100%;border-collapse:collapse;font-size:14px;color:#3a2d27;">
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Guest</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(guestName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Location</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(locationName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Date</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(reservationDate)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Time</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(reservationTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Party Size</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(partySize)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Status</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;text-transform:capitalize;">${escapeHtml(status)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#7b6252;">Confirmation</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(confirmationCode)}</td>
                  </tr>
                </table>
              </div>

              ${
                locationAddress
                  ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5d4a3f;">
                      <strong>Address:</strong><br />
                      ${escapeHtml(locationAddress)}
                    </p>`
                  : ""
              }

              ${
                reservation.special_requests
                  ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5d4a3f;">
                      <strong>Special Requests:</strong><br />
                      ${escapeHtml(reservation.special_requests)}
                    </p>`
                  : ""
              }

              <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#7b6252;">
                If you need to make changes, please contact the location directly.
              </p>
            </div>

            <div style="padding:16px 28px;background:#1f1713;color:#f7f4ef;font-size:12px;text-align:center;">
              Powered by TheOutHaven Reserve
            </div>
          </div>
        </div>
      </div>
    `;

    const text = `
${heading}

${intro}

Reservation Details:
Guest: ${guestName}
Location: ${locationName}
Date: ${reservationDate}
Time: ${reservationTime}
Party Size: ${partySize}
Status: ${status}
Confirmation: ${confirmationCode}
${locationAddress ? `Address: ${locationAddress}` : ""}

Powered by TheOutHaven Reserve
    `.trim();

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: guestEmail,
        subject,
        html,
        text,
      }),
    });

    const emailResult = await emailResponse.text();

    if (!emailResponse.ok) {
      console.error("Resend send failed", {
        status: emailResponse.status,
        body: emailResult,
      });

      return jsonResponse(
        { success: false, error: "Email could not be sent." },
        502,
      );
    }

    return jsonResponse({
      success: true,
      message: "Reservation confirmation email sent.",
      reservationId,
      to: guestEmail,
    });
  } catch (error) {
    console.error("reservation-confirmation-email error", error);

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
