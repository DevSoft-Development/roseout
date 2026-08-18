import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { normalizePhone } from "@/lib/sms/telnyx";
import { sendSms } from "@/lib/sms/sendSms";
import { ensureTeamProfileForCurrentUser, isWorkspaceLocationPermitted } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function mask(value: string | null | undefined) {
  if (!value) return null;
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : "***";
}

function claimUrl(code: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.theouthaven.com").replace(/\/$/, "");
  return `${origin}/business/claim?code=${encodeURIComponent(code)}`;
}

export async function POST(req: Request) {
  try {
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_send_claim_codes) {
      return Response.json({ error: "Claim-code sending is not enabled for your team profile." }, { status: 403 });
    }

    const body = await req.json();
    const locationId = String(body.locationId || "").trim();
    const channel = String(body.channel || "").trim().toLowerCase();
    if (!locationId || !["email", "sms"].includes(channel)) {
      return Response.json({ error: "Location and a supported delivery channel are required." }, { status: 400 });
    }
    if (!(await isWorkspaceLocationPermitted(profile, locationId))) {
      return Response.json({ error: "This location is not assigned or permitted for your workspace profile." }, { status: 403 });
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,location_name,owner_email,email,owner_phone,phone,claim_status,do_not_contact")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) return Response.json({ error: "Location not found." }, { status: 404 });
    if ((location as any).do_not_contact) {
      return Response.json({ error: "This location is marked do-not-contact." }, { status: 403 });
    }
    if ((location as any).claim_status === "claimed") {
      return Response.json({ error: "This location is already claimed." }, { status: 409 });
    }

    const sinceHour = new Date(Date.now() - 3_600_000).toISOString();
    const sinceDay = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: memberSends }, { count: locationSends }] = await Promise.all([
      supabaseAdmin.from("claim_code_audit_logs").select("id", { count: "exact", head: true }).eq("actor_user_id", user.id).eq("action", "sent").gte("created_at", sinceHour),
      supabaseAdmin.from("claim_code_audit_logs").select("id", { count: "exact", head: true }).eq("location_id", locationId).eq("action", "sent").gte("created_at", sinceDay),
    ]);
    if (!["superadmin", "manager"].includes(profile.team_type) && (Number(memberSends || 0) >= 5 || Number(locationSends || 0) >= 3)) {
      return Response.json({ error: "Claim-code send rate limit reached." }, { status: 429 });
    }

    const locationName = String((location as any).name || (location as any).location_name || "your business");
    const requestedRecipient = String(body.recipient || "").trim();
    const recipient = channel === "email"
      ? (requestedRecipient || String((location as any).owner_email || (location as any).email || "").trim())
      : normalizePhone(requestedRecipient || (location as any).owner_phone || (location as any).phone || "");

    if (!recipient) {
      return Response.json({ error: channel === "email" ? "No business email is saved for this location. Enter an email address to continue." : "No business phone is saved for this location. Enter a mobile number to continue." }, { status: 400 });
    }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (channel === "sms" && !/^\+1\d{10}$/.test(recipient)) {
      return Response.json({ error: "Enter a valid US or Canada mobile number." }, { status: 400 });
    }

    const code = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const targetMasked = mask(recipient);

    const { data: claimCode, error: createError } = await supabaseAdmin
      .from("location_claim_codes")
      .insert({
        location_id: locationId,
        code,
        status: "generated",
        sent_channel: channel,
        sent_platform: "crm",
        sent_to_masked: targetMasked,
        sent_by_user_id: user.id,
        sent_by_team_member_id: profile.id,
        expires_at: expiresAt,
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (createError) throw createError;

    const url = claimUrl(code);
    let providerMessageId: string | null = null;
    try {
      if (channel === "email") {
        const result = await sendRawBrandedEmail({
          to: recipient,
          department: "account",
          subject: `Claim ${locationName} on TheOutHaven`,
          heading: "Your TheOutHaven claim invitation",
          preview: `Claim access for ${locationName}`,
          body: `TheOutHaven has invited you to claim ${locationName}. Your claim code is ${code}. Use the secure link below to verify ownership and set up access.`,
          cta: { label: "Claim your location", href: url },
        });
        if (result.status !== "sent") throw new Error(result.error || "Email provider did not accept the message.");
        providerMessageId = result.id || null;
      } else {
        const result = await sendSms({
          to: recipient,
          body: `TheOutHaven: Claim ${locationName}. Code: ${code}. Complete your claim: ${url}`,
        });
        providerMessageId = result.id || null;
      }
    } catch (deliveryError) {
      const reason = deliveryError instanceof Error ? deliveryError.message : "Delivery failed.";
      await Promise.all([
        supabaseAdmin.from("location_claim_codes").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", claimCode.id),
        supabaseAdmin.from("claim_code_audit_logs").insert({
          claim_code_id: claimCode.id,
          location_id: locationId,
          action: "failed",
          channel,
          platform: "crm",
          actor_user_id: user.id,
          actor_team_member_id: profile.id,
          target_masked: targetMasked,
          notes: body.notes || null,
          metadata: { reason },
        }),
      ]);
      return Response.json({ error: reason }, { status: 502 });
    }

    const sentAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("location_claim_codes").update({ status: "sent", sent_at: sentAt, updated_at: sentAt }).eq("id", claimCode.id),
      supabaseAdmin.from("claim_code_audit_logs").insert({
        claim_code_id: claimCode.id,
        location_id: locationId,
        action: "sent",
        channel,
        platform: "crm",
        actor_user_id: user.id,
        actor_team_member_id: profile.id,
        target_masked: targetMasked,
        notes: body.notes || null,
        metadata: { delivery_mode: "provider_delivery", provider_message_id: providerMessageId, claim_url: url },
      }),
      supabaseAdmin.from("team_work_activities").insert({
        team_member_id: profile.id,
        user_id: user.id,
        activity_type: "claim_code_sent",
        source_type: "location_claim_codes",
        source_id: claimCode.id,
        location_id: locationId,
        status: "completed",
        notes: body.notes || null,
      }),
      supabaseAdmin.from("crm_activities").insert({
        location_id: locationId,
        actor_user_id: user.id,
        activity_type: "claim_invitation",
        direction: "outbound",
        channel,
        summary: `Claim invitation sent by ${channel === "sms" ? "text" : "email"}`,
        body: `Claim invitation sent to ${targetMasked}.`,
        occurred_at: sentAt,
        source_system: "crm",
        source_table: "location_claim_codes",
        source_record_id: claimCode.id,
        visibility: "internal",
        is_system_generated: false,
        metadata: { providerMessageId, targetMasked, expiresAt },
      }),
    ]);

    revalidatePath(`/admin/dashboard/crm/${locationId}`);
    revalidatePath("/admin/dashboard/crm/outreach");
    revalidatePath("/admin/dashboard/crm/claims");
    revalidatePath("/admin/dashboard/team/claim-code-audit");

    return Response.json({
      success: true,
      claimCodeId: claimCode.id,
      channel,
      targetMasked,
      expiresAt,
      providerMessageId,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send claim code." }, { status: 400 });
  }
}
