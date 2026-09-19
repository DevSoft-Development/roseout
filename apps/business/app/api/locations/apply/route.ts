import { createClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/notifications";
import { normalizeClaimCode } from "@/lib/claimQr";
import { normalizeAddressForSave } from "@/lib/address-utils";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeSearchTerm(value: string | null) {
  return clean(value)
    .replace(/[,%]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = normalizeSearchTerm(searchParams.get("query"));

  if (query.length < 2) {
    return Response.json({ locations: [] });
  }

  try {
    const supabase = adminSupabase();
    const search = `%${query}%`;

    const { data, error } = await supabase
      .from("locations")
      .select(
        "id, name, restaurant_name, activity_name, location_type, primary_category, address, city, state, zip_code, main_image, image_url"
      )
      .or(
        [
          `name.ilike.${search}`,
          `restaurant_name.ilike.${search}`,
          `activity_name.ilike.${search}`,
          `city.ilike.${search}`,
          `state.ilike.${search}`,
          `address.ilike.${search}`,
        ].join(",")
      )
      .limit(12);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ locations: data || [] });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}

async function validateClaimAccess(supabase: ReturnType<typeof adminSupabase>, body: Record<string, unknown>) {
  const token = clean(body.claim_token);
  const code = normalizeClaimCode(String(body.claim_code || ""));

  if (!token && !code) {
    return { ok: false, error: "To protect businesses, claiming requires the QR code or claim code provided by the location." };
  }

  const column = token ? "claim_token" : "claim_code";
  const value = token || code;

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, name, restaurant_name, activity_name, location_type, address, city, state, zip_code, source_table, source_id")
    .eq(column, value)
    .maybeSingle();

  if (locationError) throw locationError;
  if (location) return { ok: true, location };

  for (const table of ["restaurants", "activities"] as const) {
    const nameColumn = table === "restaurants" ? "restaurant_name" : "activity_name";
    const { data, error } = await supabase
      .from(table)
      .select(`id, name, ${nameColumn}, address, city, state, zip_code`)
      .eq(column, value)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      return {
        ok: true,
        location: {
          ...data,
          location_type: table === "restaurants" ? "restaurant" : "activity",
          source_table: table,
          source_id: String(data.id),
        },
      };
    }
  }

  return { ok: false, error: "Invalid claim code or QR claim link." };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const location_name = clean(body.location_name);
    const location_type = clean(body.location_type);
    const request_type = clean(body.request_type);
    const website = clean(body.website);
    const address = clean(body.address);
    const city = clean(body.city);
    const state = clean(body.state);
    const zip_code = clean(body.zip_code);
    const normalizedAddress = normalizeAddressForSave({
      address,
      city,
      state,
      zip_code,
    });
    const neighborhood = clean(body.neighborhood);
    const latitude = clean(body.latitude);
    const longitude = clean(body.longitude);
    const google_place_id = clean(body.google_place_id);
    const formatted_address = clean(body.formatted_address);
    const owner_name = clean(body.owner_name);
    const owner_email = clean(body.owner_email).toLowerCase();
    const owner_phone = clean(body.owner_phone);
    const primary_category = clean(body.primary_category);
    const instagram = clean(body.instagram);
    const external_reservation_url = clean(body.external_reservation_url);
    const main_image = clean(body.main_image || body.image_url);
    const rawNotes = clean(body.notes);
    const claim_token = clean(body.claim_token);
    const claim_code = normalizeClaimCode(body.claim_code);
    const extraNotes = [
      primary_category ? `Primary category: ${primary_category}` : "",
      instagram ? `Instagram / Social: ${instagram}` : "",
      external_reservation_url
        ? `External reservation URL: ${external_reservation_url}`
        : "",
      main_image ? `Main image: ${main_image}` : "",
    ].filter(Boolean);
    const notes = [rawNotes, ...extraNotes].filter(Boolean).join("\n\n");

    if (!location_name) {
      return Response.json(
        { error: "Business / location name is required." },
        { status: 400 }
      );
    }

    if (!location_type) {
      return Response.json(
        { error: "Location type is required." },
        { status: 400 }
      );
    }

    if (!request_type) {
      return Response.json(
        { error: "Request type is required." },
        { status: 400 }
      );
    }

    if (!owner_name || !owner_email) {
      return Response.json(
        { error: "Owner name and email are required." },
        { status: 400 }
      );
    }

    const supabase = adminSupabase();

    if (String(body.flow || "").toLowerCase() === "claim" || request_type.toLowerCase().includes("claim")) {
      const claimAccess = await validateClaimAccess(supabase, body as Record<string, unknown>);

      if (!claimAccess.ok) {
        return Response.json({ error: claimAccess.error }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from("location_claim_requests")
      .insert({
        location_name,
        location_type,
        request_type,
        website: website || null,
        address: normalizedAddress || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        neighborhood: neighborhood || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        google_place_id: google_place_id || null,
        formatted_address: formatted_address || null,
        owner_name,
        owner_email,
        owner_phone: owner_phone || null,
        notes: [notes, claim_code ? `Claim code verified: ${claim_code}` : "", claim_token ? "QR claim token verified." : ""].filter(Boolean).join("\n\n") || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;

    if (adminEmail) {
      await sendNotification({
        toEmail: adminEmail,
        subject: `New TheOutHaven location request: ${location_name}`,
        emailHtml: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>New TheOutHaven Location Request</h2>
            <p><strong>Location:</strong> ${location_name}</p>
            <p><strong>Type:</strong> ${location_type}</p>
            <p><strong>Request:</strong> ${request_type}</p>
            <p><strong>Website:</strong> ${website || "N/A"}</p>
            <p><strong>Address:</strong> ${address || "N/A"}</p>
            <p><strong>City:</strong> ${city || "N/A"}</p>
            <p><strong>State:</strong> ${state || "N/A"}</p>
            <p><strong>Zip:</strong> ${zip_code || "N/A"}</p>
            <hr />
            <p><strong>Owner / Manager:</strong> ${owner_name}</p>
            <p><strong>Email:</strong> ${owner_email}</p>
            <p><strong>Phone:</strong> ${owner_phone || "N/A"}</p>
            <p><strong>Notes:</strong><br />${notes || "N/A"}</p>
            <p><strong>Request ID:</strong> ${data.id}</p>
          </div>
        `,
      });
    }

    await sendNotification({
      toEmail: owner_email,
      subject: "TheOutHaven received your location request",
      emailHtml: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>We received your TheOutHaven request</h2>
          <p>Hi ${owner_name},</p>
          <p>Thanks for submitting <strong>${location_name}</strong> to TheOutHaven.</p>
          <p>Our team will review your request and follow up if more information is needed.</p>
          <p style="color:#555">Request ID: ${data.id}</p>
        </div>
      `,
    });

    return Response.json({
      success: true,
      message: "Request submitted. We’ll review and follow up shortly.",
      id: data.id,
    });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}