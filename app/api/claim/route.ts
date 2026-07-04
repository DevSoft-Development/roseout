import { submitLocationClaim } from "@/lib/locations/claims";

export async function POST(req: Request) {
  try {
    const result = await submitLocationClaim(await req.json());
    return Response.json({ ...result, message: result.duplicate ? "A claim is already pending for this location." : "Claim submitted." });
  } catch (error: any) {
    return Response.json({ error: error.message || "Server error" }, { status: error.status || 500 });
  }
}
