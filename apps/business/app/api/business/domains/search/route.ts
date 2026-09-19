import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { searchDomain } from "@/lib/domains/gateway";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in to search domains." }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const domain = String(payload?.domain || "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: "Enter a valid domain name." }, { status: 400 });
    }

    const result = await searchDomain(domain);
    return NextResponse.json({
      domain: result.domain,
      available: result.available,
      status: result.status,
      responseCode: result.responseCode,
      message: result.responseText,
    });
  } catch (error) {
    console.error("Business domain search failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search domains right now." },
      { status: 502 },
    );
  }
}
