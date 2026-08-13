import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDnsRecords } from "@/lib/domains/dns-records";
import { configureDomainDns } from "@/lib/domains/gateway";
import { buildRecommendedVercelRecords } from "@/lib/domains/vercel-domain-config";
import {
  addDomainToVercelProject,
  getVercelDomainConfiguration,
  getVercelProjectDomain,
  verifyVercelProjectDomain,
} from "@/lib/domains/vercel-project-domain";

async function updateConnectionState(locationId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("locations").update(values).eq("id", locationId);
  if (error) throw error;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const locationId = String(payload?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("included_domain_name,included_domain_status")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  const domain = String(location?.included_domain_name || "").trim().toLowerCase();
  if (!domain || String(location?.included_domain_status || "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "This domain must finish registration before it can be connected." }, { status: 409 });
  }

  try {
    await updateConnectionState(locationId, { included_domain_connection_status: "pending_dns" });

    let projectDomain;
    try {
      projectDomain = await getVercelProjectDomain(domain);
    } catch {
      projectDomain = await addDomainToVercelProject(domain);
    }

    const config = await getVercelDomainConfiguration(domain);
    const records = [
      ...buildRecommendedVercelRecords(config),
      ...buildDnsRecords(domain, null, null, projectDomain.verification || []),
    ].filter((record, index, all) => all.findIndex((other) => other.type === record.type && other.name === record.name && other.value === record.value) === index);

    if (!records.length && config.misconfigured) {
      await updateConnectionState(locationId, { included_domain_connection_status: "failed" });
      return NextResponse.json({ error: "Vercel did not return DNS records for this domain yet." }, { status: 409 });
    }

    if (records.length) {
      await configureDomainDns(domain, records);
      await updateConnectionState(locationId, {
        included_domain_connection_status: "pending_verification",
        included_domain_dns_configured_at: new Date().toISOString(),
      });
    }

    if (!projectDomain.verified) {
      try {
        await verifyVercelProjectDomain(domain);
      } catch (error) {
        console.info("Domain verification is still pending", { domain, error });
      }
    }

    const finalProjectDomain = await getVercelProjectDomain(domain);
    const finalConfig = await getVercelDomainConfiguration(domain);
    const connected = Boolean(finalProjectDomain.verified) && finalConfig.misconfigured === false;
    const checkedAt = new Date().toISOString();

    await updateConnectionState(locationId, {
      included_domain_connection_status: connected ? "connected" : "pending_verification",
      included_domain_verification_checked_at: checkedAt,
      ...(connected ? { included_domain_connected_at: checkedAt } : {}),
    });

    return NextResponse.json({
      ok: true,
      domain,
      verified: Boolean(finalProjectDomain.verified),
      configured: finalConfig.misconfigured === false,
      pending: !connected,
    });
  } catch (error) {
    console.error("Domain connection failed", error);
    await supabaseAdmin
      .from("locations")
      .update({ included_domain_connection_status: "failed" })
      .eq("id", locationId);
    return NextResponse.json({ error: "Unable to connect this domain right now." }, { status: 502 });
  }
}
