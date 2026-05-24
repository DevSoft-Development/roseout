export const ACTIVE_OUTING_KEY = "theouthaven_active_outing";

export async function startTrackedOuting({
  locationId,
  locationType,
  externalReservationUrl,
  phoneNumber,
  contactMethod,
}: {
  locationId?: string;
  locationType?: string;
  externalReservationUrl?: string;
  phoneNumber?: string;
  contactMethod?: string;
}) {
  const response = await fetch("/api/outings/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location_id: locationId,
      location_type: locationType,
      external_reservation_url: externalReservationUrl,
      phone_number: phoneNumber,
      contact_method: contactMethod,
    }),
  });

  return response.json();
}
