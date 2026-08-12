export const dynamic = "force-dynamic";

export async function POST() {
  return new Response("SMS replies are now handled by the verified Telnyx messaging webhook.", {
    status: 410,
    headers: { "Content-Type": "text/plain" },
  });
}
