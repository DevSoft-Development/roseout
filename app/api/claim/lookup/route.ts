import { lookupClaimToken } from "@/lib/locations/claims";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return Response.json({ error: "Missing token" }, { status: 400 });
  try {
    const result = await lookupClaimToken(token);
    if (!result) return Response.json({ error: "Claim link was not found." }, { status: 404 });
    return Response.json({ target: result.target, claimAccess: result.claimAccess, restaurant: result.target, activity: result.target, location: result.target });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
