import { normalizeClaimCode } from "@/lib/claimQr";
import { lookupClaimCode, lookupClaimToken } from "@/lib/locations/claims";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token")?.trim();
  const code = normalizeClaimCode(searchParams.get("code") || "");

  if (!token && !code) {
    return Response.json({ error: "Enter a claim code or open a valid QR claim link." }, { status: 400 });
  }

  try {
    const result = token ? await lookupClaimToken(token) : await lookupClaimCode(code);
    if (!result) return Response.json({ error: "Claim code or QR link was not found." }, { status: 404 });
    return Response.json({ location: result.target, target: result.target, claimAccess: result.claimAccess });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
