import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName as getDisplayLocationName } from "@/lib/locationName";
import { getPrimaryCategory } from "@/lib/locationFields";
import { getLocationScore } from "@/lib/locationScore";
import {
  getOperatingHoursForDate,
  timeWindowToSlots,
} from "@/lib/locationHours";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();

  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";

  return "restaurant";
}

function getTableName(type: string) {
  return type === "activity" ? "activities" : "locations";
}

const LOCATION_HOURS_SELECT =
  "operating_hours, special_hours, holiday_closures, hours, hours_of_operation, days_of_operation, kitchen_closing_time";

function getReservationLocationName(location: any, type: string) {
  return getDisplayLocationName(
    location,
    type === "activity" ? "TheOutHaven Activity" : "TheOutHaven Location"
  );
}


function getAddress(location: any) {
  return [location?.address, location?.city, location?.state, location?.zip_code]
    .filter(Boolean)
    .join(", ");
}

function getLocationEmail(location: any) {
  return (
    location?.email ||
    location?.contact_email ||
    location?.owner_email ||
    location?.business_email ||
    ""
  );
}

function getLocationPhone(location: any) {
  return (
    location?.phone ||
    location?.phone_number ||
    location?.contact_phone ||
    location?.business_phone ||
    ""
  );
}

function generateTimeSlots() {
  return [
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
  ];
}

function formatTime(time: string) {
  const [hourRaw, minute] = time.split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  if (!process.env.RESEND_API_KEY || !to) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESERVE_FROM_EMAIL ||
        "TheOutHaven Reserve <hello@theouthaven.com>",
      to,
      subject,
      html,
      reply_to: replyTo || undefined,
    }),
  });
}

async function sendSms({ to, body }: { to: string; body: string }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE;

  if (!sid || !token || !from || !to) return;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const params = new URLSearchParams();
  params.append("To", to);
  params.append("From", from);
  params.append("Body", body);

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
}

async function notifyReservation({
  location,
  locationType,
  reservation,
}: {
  location: any;
  locationType: string;
  reservation: any;
}) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";

  const locationName = getReservationLocationName(location, locationType);
  const locationEmail = getLocationEmail(location);
  const locationPhone = getLocationPhone(location);

  const confirmationUrl = `${siteUrl}/reserve/confirmation/${reservation.customer_token}`;

  const statusText =
    reservation.status === "confirmed"
      ? "confirmed"
      : "received and pending confirmation";

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;background:#fff;padding:24px;">
      <h2 style="margin:0 0 12px;color:#111;">TheOutHaven Reserve</h2>
      <p>Hi ${reservation.customer_name}, your reservation at <strong>${locationName}</strong> has been <strong>${statusText}</strong>.</p>

      <div style="background:#f8f8f8;border-radius:16px;padding:16px;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Date:</strong> ${reservation.reservation_date}</p>
        <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatTime(
          reservation.reservation_time.slice(0, 5)
        )}</p>
        <p style="margin:0 0 8px;"><strong>Party Size:</strong> ${reservation.party_size}</p>
        ${
          reservation.bookable_item_name
            ? `<p style="margin:0;"><strong>Reserved:</strong> ${reservation.bookable_item_name}</p>`
            : ""
        }
      </div>

      <p>
        <a href="${confirmationUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">
          View / Manage Reservation
        </a>
      </p>

      <p style="font-size:13px;color:#666;">Use this link to view your reservation or cancel if needed.</p>
      <p>Thank you for using TheOutHaven.</p>
    </div>
  `;

  const ownerHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;background:#fff;padding:24px;">
      <h2 style="margin:0 0 12px;color:#111;">New TheOutHaven Reservation</h2>
      <p><strong>${reservation.customer_name}</strong> submitted a reservation for <strong>${locationName}</strong>.</p>

      <div style="background:#f8f8f8;border-radius:16px;padding:16px;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Status:</strong> ${reservation.status}</p>
        <p style="margin:0 0 8px;"><strong>Date:</strong> ${reservation.reservation_date}</p>
        <p style="margin:0 0 8px;"><strong>Time:</strong> ${formatTime(
          reservation.reservation_time.slice(0, 5)
        )}</p>
        <p style="margin:0 0 8px;"><strong>Party Size:</strong> ${reservation.party_size}</p>
        ${
          reservation.bookable_item_name
            ? `<p style="margin:0 0 8px;"><strong>Item:</strong> ${reservation.bookable_item_name}</p>`
            : ""
        }
        ${
          reservation.customer_phone
            ? `<p style="margin:0 0 8px;"><strong>Phone:</strong> ${reservation.customer_phone}</p>`
            : ""
        }
        ${
          reservation.customer_email
            ? `<p style="margin:0 0 8px;"><strong>Email:</strong> ${reservation.customer_email}</p>`
            : ""
        }
        ${
          reservation.special_request
            ? `<p style="margin:0;"><strong>Request:</strong> ${reservation.special_request}</p>`
            : ""
        }
      </div>

      <p>
        <a href="${siteUrl}/reserve/portal/reservations?locationId=${reservation.location_id}&type=${reservation.location_type}" style="display:inline-block;background:#111;color:white;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">
          Open Reserve Portal
        </a>
      </p>
    </div>
  `;

  await Promise.allSettled([
    sendEmail({
      to: reservation.customer_email,
      subject: `Your ${locationName} reservation:`,
      html: customerHtml,
      replyTo: locationEmail,
    }),
    sendEmail({
      to: locationEmail,
      subject: `Your ${locationName} reservation: ${reservation.customer_name}`,
      html: ownerHtml,
      replyTo: reservation.customer_email || undefined,
    }),
    sendSms({
      to: reservation.customer_phone,
      body: `Your reservation at ${locationName} for ${
        reservation.reservation_date
      } at ${formatTime(
        reservation.reservation_time.slice(0, 5)
      )} is ${statusText}. Manage: ${confirmationUrl}`,
    }),
    sendSms({
      to: locationPhone,
      body: `Your reservation: ${reservation.customer_name}, ${
        reservation.party_size
      } guests, ${reservation.reservation_date} at ${formatTime(
        reservation.reservation_time.slice(0, 5)
      )}.`,
    }),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const locationId = searchParams.get("locationId");
    const locationType = normalizeType(searchParams.get("type") || "restaurant");
    const reservationDate = cleanString(searchParams.get("reservationDate"));
    const partySize = Number(searchParams.get("partySize") || 2);

    if (!locationId) {
      return NextResponse.json({ error: "Missing locationId." }, { status: 400 });
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from(getTableName(locationType))
      .select(`*, ${LOCATION_HOURS_SELECT}`)
      .eq("id", locationId)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!location) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("location_bookable_items")
      .select("*")
      .eq("location_id", locationId)
      .eq("location_type", locationType)
      .eq("is_active", true)
      .order("capacity_min", { ascending: true })
      .order("item_name", { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    let enrichedItems = items || [];

    if (reservationDate) {
      const structuredHours = getOperatingHoursForDate(location, reservationDate);
      const slots = structuredHours
        ? timeWindowToSlots(
            structuredHours,
            Number(location.default_duration_minutes || 90)
          )
        : generateTimeSlots();

      const { data: existingReservations, error: existingError } =
        await supabaseAdmin
          .from("location_reservations")
          .select("bookable_item_id, reservation_time, status")
          .eq("location_id", locationId)
          .eq("location_type", locationType)
          .eq("reservation_date", reservationDate)
          .in("status", ["pending", "confirmed"]);

      if (existingError) {
        return NextResponse.json(
          { error: existingError.message },
          { status: 500 }
        );
      }

      enrichedItems = enrichedItems.map((item: any) => {
        const maxConcurrent = Number(item.max_concurrent || 1);

        const available_slots = slots
          .map((slot) => {
            const bookedCount =
              existingReservations?.filter(
                (reservation: any) =>
                  reservation.bookable_item_id === item.id &&
                  String(reservation.reservation_time).slice(0, 5) === slot
              ).length || 0;

            return {
              time: slot,
              label: formatTime(slot),
              available: bookedCount < maxConcurrent,
              remaining: Math.max(maxConcurrent - bookedCount, 0),
            };
          })
          .filter((slot) => slot.available);

        return {
          ...item,
          available_slots,
        };
      });
    }

    const partyFilteredItems = enrichedItems.filter(
      (item: any) =>
        partySize >= Number(item.capacity_min || 1) &&
        partySize <= Number(item.capacity_max || 999)
    );

    return NextResponse.json({
      location: {
        id: locationId,
        type: locationType,
        name: getReservationLocationName(location, locationType),
        address: getAddress(location),
        main_image: location.main_image || null,
        image_url:
          location.image_url || location.photo_url || location.image || null,
        images: Array.isArray(location.images) ? location.images : null,
        category: getPrimaryCategory(location),
        theouthaven_score: getLocationScore(location),
        roseout_score: location.roseout_score || null,
        quality_score: location.quality_score || null,
        trend_score: location.trend_score || null,
        conversion_score: location.conversion_score || null,
        review_score: location.review_score || null,
        popularity_score: location.popularity_score || null,
        ranking_badge: location.ranking_badge || null,
        operating_hours: location.operating_hours || null,
        special_hours: location.special_hours || null,
        holiday_closures: location.holiday_closures || null,
        hours: location.hours || null,
        hours_of_operation: location.hours_of_operation || null,
        days_of_operation: Array.isArray(location.days_of_operation)
          ? location.days_of_operation
          : null,
        kitchen_closing_time: location.kitchen_closing_time || null,
      },
      items: partyFilteredItems,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const locationId = cleanString(body.location_id);
    const locationType = normalizeType(cleanString(body.location_type));

    const customerName = cleanString(body.customer_name);
    const customerEmail = cleanString(body.customer_email);
    const customerPhone = cleanString(body.customer_phone);

    const reservationDate = cleanString(body.reservation_date);
    const reservationTime = cleanString(body.reservation_time);
    const specialRequest = cleanString(body.special_request);

    const partySize = Number(body.party_size || 2);
    const bookableItemId = cleanString(body.bookable_item_id);

    if (!locationId) {
      return NextResponse.json({ error: "Missing location." }, { status: 400 });
    }

    if (!customerName) {
      return NextResponse.json(
        { error: "Please enter your name." },
        { status: 400 }
      );
    }

    if (!customerPhone && !customerEmail) {
      return NextResponse.json(
        { error: "Please enter a phone number or email." },
        { status: 400 }
      );
    }

    if (!reservationDate || !reservationTime) {
      return NextResponse.json(
        { error: "Please select a date and time." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(partySize) || partySize < 1) {
      return NextResponse.json(
        { error: "Please enter a valid party size." },
        { status: 400 }
      );
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from(getTableName(locationType))
      .select(`*, ${LOCATION_HOURS_SELECT}`)
      .eq("id", locationId)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!location) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    const structuredHours = getOperatingHoursForDate(location, reservationDate);

    if (structuredHours) {
      const validSlots = timeWindowToSlots(
        structuredHours,
        Number(location.default_duration_minutes || 90)
      );

      if (!validSlots.includes(reservationTime.slice(0, 5))) {
        return NextResponse.json(
          { error: "This time is outside the location's operating hours." },
          { status: 400 }
        );
      }
    }

    let selectedItem: any = null;

    if (bookableItemId) {
      const { data: item, error: itemError } = await supabaseAdmin
        .from("location_bookable_items")
        .select("*")
        .eq("id", bookableItemId)
        .eq("location_id", locationId)
        .eq("location_type", locationType)
        .eq("is_active", true)
        .maybeSingle();

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }

      if (!item) {
        return NextResponse.json(
          { error: "Selected reservation option is no longer available." },
          { status: 400 }
        );
      }

      if (
        partySize < Number(item.capacity_min || 1) ||
        partySize > Number(item.capacity_max || 999)
      ) {
        return NextResponse.json(
          { error: "This reservation option does not fit your party size." },
          { status: 400 }
        );
      }

      selectedItem = item;

      const { data: existingReservations, error: existingError } =
        await supabaseAdmin
          .from("location_reservations")
          .select("id")
          .eq("location_id", locationId)
          .eq("location_type", locationType)
          .eq("bookable_item_id", selectedItem.id)
          .eq("reservation_date", reservationDate)
          .eq("reservation_time", reservationTime)
          .in("status", ["pending", "confirmed"]);

      if (existingError) {
        return NextResponse.json(
          { error: existingError.message },
          { status: 500 }
        );
      }

      const currentCount = existingReservations?.length || 0;
      const maxConcurrent = Number(selectedItem.max_concurrent || 1);

      if (currentCount >= maxConcurrent) {
        return NextResponse.json(
          {
            error: "This time slot is fully booked. Please select another time.",
          },
          { status: 400 }
        );
      }
    }

    const status = selectedItem?.auto_confirm === false ? "pending" : "confirmed";
    const customerToken = crypto.randomUUID();

    const customerTokenExpiresAt = new Date(
  Date.now() + 72 * 60 * 60 * 1000
).toISOString();

    const { data: reservation, error } = await supabaseAdmin
      .from("location_reservations")
      .insert({
        location_id: locationId,
        location_type: locationType,

        bookable_item_id: selectedItem?.id || null,
        bookable_item_name: selectedItem?.item_name || null,
        bookable_item_type: selectedItem?.item_type || null,

        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,

        reservation_date: reservationDate,
        reservation_time: reservationTime,
        party_size: partySize,

        special_request: specialRequest || null,
        status,
        source: "theouthaven",

        customer_token: customerToken,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await notifyReservation({
      location,
      locationType,
      reservation,
    });

    return NextResponse.json({
      success: true,
      reservation,
      auto_confirmed: status === "confirmed",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}