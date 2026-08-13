import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getDomainGatewayStatus } from "@/lib/domains/gateway";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const status = await getDomainGatewayStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Domain gateway status failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Domain gateway unavailable." },
      { status: 502 },
    );
  }
}
