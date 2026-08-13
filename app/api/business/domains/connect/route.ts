import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDnsRecords } from "@/lib/domains/dns-records";
import { configureDomainDns } from "@/lib/domains/gateway";
import { allocateLightsailWebsiteNode } from "@/lib/hosting/lightsail-nodes";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const locationId = String(payload?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("included_domain_name,included_domain_status")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();

  if (locationError) {
    console.error("Domain connection location lookup failed", locationError);
    return NextResponse.json({ error: "Unable to load this location right now." }, { status: 502 });
  }

  const domain = String(location?.included_domain_name || "").trim().toLowerCase();
  if (!domain || String(location?.included_domain_status || "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "This domain must finish registration before it can be connected." }, { status: 409 });
  }

  try {
    const { website, node } = await allocateLightsailWebsiteNode(locationId, domain);
    const records = buildDnsRecords(domain, node.public_ip, domain);

    await configureDomainDns(domain, records);

    const { error: statusError } = await supabaseAdmin
      .from("business_websites")
      .update({
        dns_status: "configured",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", website.id);

    if (statusError) throw statusError;

    return NextResponse.json({
      ok: true,
      domain,
      hosting: {
        provider: "lightsail",
        node: node.name,
        deployment_status: website.deployment_status,
        dns_status: "configured",
        ssl_status: website.ssl_status,
        status: website.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("Lightsail domain connection failed", { locationId, domain, error });

    if (message === "no_healthy_hosting_capacity") {
      return NextResponse.json(
        { error: "Website hosting is being prepared. Please try again shortly." },
        { status: 503 },
      );
    }

    if (message === "website_domain_conflict") {
      return NextResponse.json(
        { error: "This location is already assigned to a different website domain." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Unable to connect this domain right now." }, { status: 502 });
  }
}
