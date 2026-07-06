import { claimLookupResponsePayload, lookupClaimToken } from "@/lib/locations/claims";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await lookupClaimToken(searchParams.get("token") || "");
  if (!result.ok) {
    return Response.json({ error: result.error, reason: result.reason }, { status: result.status || 400 });
  }
  return Response.json(claimLookupResponsePayload(result.target));
}
