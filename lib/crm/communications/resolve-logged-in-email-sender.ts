import "server-only";

import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LoggedInEmailSender = {
  userId: string;
  displayName: string;
  emailAddress: string;
  from: string;
  replyTo: string[];
  provider: string;
  allowedCommunicationTypes: string[];
};

export async function resolveLoggedInEmailSender(): Promise<LoggedInEmailSender> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    throw new Error("You must be signed in with an email account.");
  }

  const normalizedEmail = user.email.trim().toLowerCase();

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("crm_email_sender_settings")
    .select(`
      allowed_domain,
      catch_all_reply_to,
      provider,
      is_active
    `)
    .eq("setting_key", "default")
    .single();

  if (settingsError || !settings?.is_active) {
    throw new Error("CRM email sending is not configured.");
  }

  if (!normalizedEmail.endsWith(`@${settings.allowed_domain}`)) {
    throw new Error(
      `You must be signed in with an @${settings.allowed_domain} email address.`,
    );
  }

  const { data: permission, error: permissionError } = await supabaseAdmin
    .from("crm_user_sender_permissions")
    .select(`
      display_name,
      can_send_email,
      additional_reply_to,
      allowed_communication_types,
      is_active
    `)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (
    permissionError ||
    !permission?.is_active ||
    !permission.can_send_email
  ) {
    throw new Error("Your account is not authorized to send CRM email.");
  }

  const displayName =
    permission.display_name?.trim() ||
    String(user.user_metadata?.full_name || "").trim() ||
    normalizedEmail.split("@")[0];

  const replyTo = Array.from(
    new Set(
      [
        normalizedEmail,
        ...(settings.catch_all_reply_to ?? []),
        ...(permission.additional_reply_to ?? []),
      ]
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return {
    userId: user.id,
    displayName,
    emailAddress: normalizedEmail,
    from: `${displayName} <${normalizedEmail}>`,
    replyTo,
    provider: settings.provider,
    allowedCommunicationTypes:
      permission.allowed_communication_types ?? [],
  };
}