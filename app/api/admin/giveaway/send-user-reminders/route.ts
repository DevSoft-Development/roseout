import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

type GiveawayEntry = {
  id: string;
  full_name: string | null;
  email: string | null;
  social_handle: string | null;
  wants_giveaway: boolean | null;
  email_verified: boolean | null;
  email_verified_at: string | null;
  followed_social: boolean | null;
  tagged_two_friends: boolean | null;
  giveaway_status: string | null;
  email_verification_attempts: number | null;
};

const REQUIREMENT_LABELS = {
  email: "Verify your email",
} as const;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hasUsableHandle(value: string | null) {
  const handle = value?.trim() || "";
  return Boolean(handle && handle !== "@");
}

function missingRequirements(entry: GiveawayEntry) {
  const missing: string[] = [];
  if (!entry.email_verified || !entry.email_verified_at)
    missing.push(REQUIREMENT_LABELS.email);
  return missing;
}

async function sendUserReminder(entry: GiveawayEntry, missing: string[]) {
  if (!entry.email)
    return { status: "skipped" as const, reason: "missing_email" };

  const firstName = entry.full_name?.trim().split(/\s+/)[0] || "there";
  const sections = [
    { type: "paragraph" as const, text: `Hi ${firstName},` },
    {
      type: "paragraph" as const,
      text: "A quick reminder from TheOutHaven: complete the required weekly beta steps to become prize-ready. Optional bonus entries: follow @theouthaven on Instagram and/or TikTok. Each verified follow adds one bonus entry. Following is optional and is not required to qualify.",
    },
    {
      type: "infoList" as const,
      title: "Still needed",
      items: missing.map((item) => ({ label: item, value: "Incomplete" })),
    },
  ];

  let cta = { label: "Open TheOutHaven", url: buildSiteUrl("/launch") };
  const updates: Record<string, unknown> = {};

  if (missing.includes(REQUIREMENT_LABELS.email)) {
    const token = randomBytes(32).toString("base64url");
    updates.email_verification_token_hash = hashToken(token);
    updates.email_verification_sent_at = new Date().toISOString();
    updates.email_verification_expires_at = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();
    updates.email_verification_attempts =
      Number(entry.email_verification_attempts || 0) + 1;
    cta = {
      label: "Verify Email",
      url: buildSiteUrl(`/launch/verify?token=${encodeURIComponent(token)}`),
    };
  }

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin
      .from("launch_waitlist_signups")
      .update(updates)
      .eq("id", entry.id);
    if (error) return { status: "error" as const, error: error.message };
  }

  const result = await sendRawBrandedEmail({
    to: entry.email,
    department: "account",
    subject: "Complete your TheOutHaven Launch Giveaway entry",
    heading: "Complete your giveaway entry",
    preview: "Your TheOutHaven Launch Giveaway entry still needs a few steps.",
    sections,
    cta,
  });

  return result.status === "sent" || result.status === "skipped"
    ? { status: result.status }
    : { status: "error" as const, error: result.error || "Email send failed" };
}

export async function POST() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.giveawayManage);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select(
      "id,full_name,email,social_handle,wants_giveaway,email_verified,email_verified_at,followed_social,tagged_two_friends,giveaway_status,email_verification_attempts",
    )
    .eq("wants_giveaway", true)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  const eligible = (data || []).filter(
    (entry) =>
      !["verified", "winner", "disqualified"].includes(
        entry.giveaway_status || "",
      ),
  ) as GiveawayEntry[];
  const reminders = eligible
    .map((entry) => ({ entry, missing: missingRequirements(entry) }))
    .filter((item) => item.missing.length > 0 && Boolean(item.entry.email));

  let sent = 0;
  let skipped = (data || []).length - reminders.length;
  let failed = 0;

  for (const reminder of reminders) {
    const result = await sendUserReminder(reminder.entry, reminder.missing);
    if (result.status === "sent") sent += 1;
    else if (result.status === "skipped") skipped += 1;
    else failed += 1;
  }

  return NextResponse.json({
    success: failed === 0,
    sent,
    skipped,
    failed,
    message: `Reminder emails sent to ${sent} users. Skipped ${skipped} users.`,
  });
}
