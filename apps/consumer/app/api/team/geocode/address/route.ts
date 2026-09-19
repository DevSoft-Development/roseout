export async function POST(req: Request) {
  const { address } = await req.json();
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) {
    return Response.json(
      {
        error:
          "Google Geocoding key is not configured; use manual address fields.",
      },
      { status: 503 },
    );
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${encodeURIComponent(key)}`,
  );
  const data = await res.json();
  const first = data.results?.[0];

  return Response.json({
    formattedAddress: first?.formatted_address || null,
    lat: first?.geometry?.location?.lat || null,
    lng: first?.geometry?.location?.lng || null,
    placeId: first?.place_id || null,
    provider: "google",
  });
}
