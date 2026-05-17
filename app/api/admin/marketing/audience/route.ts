import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireMarketingAdminApi, requireMarketingViewerApi } from "@/lib/marketing-admin";

export const dynamic = "force-dynamic";

type MarketingUserRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  marketing_opt_in?: boolean | null;
};

type Subscriber = {
  id: string;
  user_id?: string | null;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  email_opt_in?: boolean | null;
  sms_opt_in?: boolean | null;
  email_opted_out_at?: string | null;
  sms_opted_out_at?: string | null;
};

function uniqueSubscribers(rows: Subscriber[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.email?.toLowerCase() || row.phone || row.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET() {
  const { error } = await requireMarketingViewerApi();
  if (error) return error;

  const [audiencesResult, subscribersResult, usersResult] = await Promise.all([
    supabaseAdmin.from("marketing_audiences").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("marketing_subscribers").select("*").limit(1000),
    supabaseAdmin
      .from("users")
      .select("id,email,phone,full_name,marketing_opt_in,created_at")
      .eq("marketing_opt_in", true)
      .limit(1000),
  ]);

  if (audiencesResult.error) return NextResponse.json({ error: audiencesResult.error.message }, { status: 500 });

  const subscriberRows = subscribersResult.data || [];
  const userRows = ((usersResult.data || []) as MarketingUserRow[]).map((user) => ({
    id: `user-${user.id}`,
    user_id: user.id,
    email: user.email || null,
    phone: user.phone || null,
    full_name: user.full_name || null,
    email_opt_in: Boolean(user.marketing_opt_in && user.email),
    sms_opt_in: Boolean(user.marketing_opt_in && user.phone),
  }));

  const subscribers = uniqueSubscribers([...subscriberRows, ...userRows]);
  const emailCount = subscribers.filter((row) => row.email && row.email_opt_in && !row.email_opted_out_at).length;
  const smsCount = subscribers.filter((row) => row.phone && row.sms_opt_in && !row.sms_opted_out_at).length;

  return NextResponse.json({
    audiences: audiencesResult.data || [],
    subscribers,
    counts: { total: subscribers.length, email: emailCount, sms: smsCount },
    warnings: [subscribersResult.error?.message, usersResult.error?.message].filter(Boolean),
  });
}

export async function POST(req: Request) {
  const { error, adminUser } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New Audience";

  const { data, error: insertError } = await supabaseAdmin
    .from("marketing_audiences")
    .insert({
      name,
      description: typeof body.description === "string" ? body.description.trim() : null,
      segment_key: typeof body.segment_key === "string" && body.segment_key.trim() ? body.segment_key.trim() : null,
      filters: typeof body.filters === "object" && body.filters ? body.filters : {},
      created_by: adminUser?.id || null,
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ audience: data }, { status: 201 });
}
