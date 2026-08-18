import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendTransactionalSms } from "@/lib/sms/telnyx";
import { supabaseAdmin } from "@/lib/supabase-admin";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.theouthaven.com").replace(/\/$/, "");
}

function pickPhone(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  for (const key of ["mobile_number", "phone", "phone_number", "mobile_phone"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function resolveUserDestination(userId: string) {
  const [{ data: profile }, { data: appUser }, authResult] = await Promise.all([
    supabaseAdmin.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("users").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);
  const authUser = authResult.data.user;
  const email = String((profile as any)?.email || (appUser as any)?.email || authUser?.email || "").trim() || null;
  const phone = pickPhone(profile as any) || pickPhone(appUser as any) || pickPhone((authUser?.user_metadata || {}) as any);
  const name = String((profile as any)?.full_name || (appUser as any)?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || "").trim() || null;
  return { email, phone, name };
}

export async function sendCrmUnreadAlert(params: {
  notificationId: string;
  ownerUserId: string | null;
  title: string;
  body: string;
  actionHref: string;
}) {
  if (!params.ownerUserId) return { skipped: true, reason: "unassigned" } as const;

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("crm_message_notifications")
    .update({ target_user_id: params.ownerUserId, alert_claimed_at: claimedAt })
    .eq("id", params.notificationId)
    .is("alert_claimed_at", null)
    .is("read_at", null)
    .is("dismissed_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed?.id) return { skipped: true, reason: "already_claimed_or_read" } as const;

  const destination = await resolveUserDestination(params.ownerUserId);
  const url = `${siteUrl()}${params.actionHref.startsWith("/") ? params.actionHref : `/${params.actionHref}`}`;
  let emailStatus = destination.email ? "pending" : "missing_destination";
  let smsStatus = destination.phone ? "pending" : "missing_destination";

  if (destination.email) {
    const email = await sendRawBrandedEmail({
      to: destination.email,
      department: "account",
      subject: params.title,
      heading: "Unread CRM message",
      preview: params.title,
      body: `${destination.name ? `Hi ${destination.name},\n\n` : ""}${params.body}\n\nOpen the CRM conversation: ${url}`,
      cta: { label: "Open CRM conversation", url },
    });
    emailStatus = email.status;
  }

  if (destination.phone) {
    try {
      await sendTransactionalSms({
        to: destination.phone,
        body: `TheOutHaven CRM: ${params.title}. ${params.body.slice(0, 180)} Open: ${url}`,
      });
      smsStatus = "sent";
    } catch {
      smsStatus = "error";
    }
  }

  const alertedAt = new Date().toISOString();
  await supabaseAdmin
    .from("crm_message_notifications")
    .update({
      email_alert_status: emailStatus,
      sms_alert_status: smsStatus,
      alerted_at: alertedAt,
    })
    .eq("id", params.notificationId);

  return { skipped: false, emailStatus, smsStatus } as const;
}
