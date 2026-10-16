import crypto from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lookupSecureClaim, logClaimFunnelEvent } from "@/lib/business-claim/secureClaim";
import { getClaimMethodDecision } from "@/lib/business-claim/methodPolicy";

export const dynamic = "force-dynamic";
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

async function session() {
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user;
}
function websiteDomain(website: string) {
  const url = new URL(website.startsWith("http") ? website : "https://" + website);
  if (!["https:","http:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error("invalid_website");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.endsWith(".local")) throw new Error("invalid_domain");
  return host;
}
export async function POST(req: Request) {
  const user = await session();
  if (!user) return Response.json({ error: "auth_required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const lookup = await lookupSecureClaim(body.code);
  if (!lookup.ok) return Response.json({ error: "claim_unavailable" }, { status: 409 });
  const decision = await getClaimMethodDecision(String(lookup.location.id));
  if (!decision.methods.includes("dns")) return Response.json({ error: "method_unavailable" }, { status: 400 });
  let domain: string;
  try { domain = websiteDomain(String(lookup.location.website || "")); }
  catch { return Response.json({ error: "invalid_business_domain" }, { status: 400 }); }
  const { count, error: countError } = await supabaseAdmin.from("claim_domain_challenges")
    .select("id", { count: "exact", head: true }).eq("claimant_user_id", user.id)
    .gte("created_at", new Date(Date.now()-3600_000).toISOString());
  if (countError) return Response.json({ error: "challenge_unavailable" }, { status: 503 });
  if ((count ?? 0) >= 5) return Response.json({ error: "rate_limited" }, { status: 429 });
  const token = "toh-claim-" + crypto.randomBytes(24).toString("hex");
  const { data, error } = await supabaseAdmin.from("claim_domain_challenges").insert({
    location_id: lookup.location.id, claimant_user_id: user.id, method: "dns", domain,
    token_hash: sha(token), expires_at: new Date(Date.now()+30*60_000).toISOString()
  }).select("id,expires_at").single();
  if (error || !data) return Response.json({ error: "challenge_unavailable" }, { status: 503 });
  return Response.json({ ok: true, challengeId: data.id, recordType: "TXT",
    recordName: "_theouthaven-claim." + domain, recordValue: token, expiresAt: data.expires_at });
}
export async function PUT(req: Request) {
  const user = await session();
  if (!user) return Response.json({ error: "auth_required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.challengeId || "");
  if (!/^[a-f\d-]{36}$/i.test(id)) return Response.json({ error: "invalid_challenge" }, { status: 400 });
  const { data: challenge, error } = await supabaseAdmin.from("claim_domain_challenges")
    .select("id,location_id,claimant_user_id,method,domain,status,expires_at,attempt_count,token_hash")
    .eq("id", id).eq("claimant_user_id", user.id).maybeSingle();
  if (error || !challenge || challenge.method !== "dns" || challenge.status !== "pending")
    return Response.json({ error: "challenge_unavailable" }, { status: 404 });
  if (Date.parse(challenge.expires_at) <= Date.now()) return Response.json({ error: "expired" }, { status: 410 });
  if (challenge.attempt_count >= 5) return Response.json({ error: "rate_limited" }, { status: 429 });
  // Compare current official business domain to the issued challenge to reject stale evidence.
  const { data: location } = await supabaseAdmin.from("locations").select("website,owner_user_id,is_claimed").eq("id",challenge.location_id).maybeSingle();
  if (!location || location.is_claimed || location.owner_user_id || websiteDomain(String(location.website || "")) !== challenge.domain)
    return Response.json({ error: "location_unavailable" }, { status: 409 });
  const { data: bumped } = await supabaseAdmin.from("claim_domain_challenges")
    .update({ attempt_count: challenge.attempt_count + 1 }).eq("id", id)
    .eq("status","pending").eq("attempt_count",challenge.attempt_count).select("id");
  if (!bumped?.length) return Response.json({ error: "retry" }, { status: 409 });
  let found = false;
  try {
    const records = await resolveTxt("_theouthaven-claim." + challenge.domain);
    found = records.map(parts => parts.join("")).some(value => sha(value.trim()) === challenge.token_hash);
  } catch { /* No valid TXT record currently resolves. */ }
  if (!found) return Response.json({ ok:false, error: "record_not_found" }, { status: 409 });
  const { data: verified } = await supabaseAdmin.from("claim_domain_challenges")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id",id).eq("status","pending").select("id");
  if (!verified?.length) return Response.json({ error: "already_processed" }, { status: 409 });
  await logClaimFunnelEvent({ locationId: challenge.location_id, eventType:"dns_ownership_evidence_verified",
    metadata:{method:"dns",requiresOwnershipReview:true} });
  return Response.json({ok:true,verified:true,ownershipApproved:false,
    message:"Domain control verified. Business ownership still requires review."});
}
