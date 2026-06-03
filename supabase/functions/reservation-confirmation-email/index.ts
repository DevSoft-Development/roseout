import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const payload = await req.json().catch(() => ({}));
  const reservationId = payload.reservationId || payload.reservation_id;

  if (!reservationId) {
    return jsonResponse({ success: false, error: "reservationId is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { success: false, error: "Reservation email service is not configured." },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: reservation, error } = await supabase
    .from("location_reservations")
    .select("id, guest_email, customer_email, email, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) {
    console.error("Reservation lookup error", error);
    return jsonResponse(
      {
        success: false,
        error: "Could not load reservation.",
        details: error?.message || reservationError?.message || "No error message",
        code: error?.code || reservationError?.code || null,
        hint: error?.hint || reservationError?.hint || null,
      },
      500,
    );
  }

  if (!reservation) {
    return jsonResponse({ success: false, error: "Reservation not found." }, 404);
  }

  const guestEmail =
    reservation.guest_email ||
    reservation.customer_email ||
    reservation.email;

  if (!guestEmail) {
    return jsonResponse({ success: false, error: "Reservation has no guest email." }, 400);
  }

  return jsonResponse({
    success: true,
    message: "Reservation confirmation function is connected.",
    reservationId,
    guestEmail,
    status: reservation.status,
  });
});
