export async function POST(req: Request) {
  const { lat, lng } = await req.json();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return Response.json({ formattedAddress: `near ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`, provider: "manual_fallback" });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${key}`);
  const data = await res.json();
  const first = data.results?.[0];
  return Response.json({ formattedAddress: first?.formatted_address || null, placeName: first?.address_components?.[0]?.long_name || null, provider: "google" });
}
