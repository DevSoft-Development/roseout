import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, purposeForTelnyxNumber } from "@/lib/sms/telnyx";

export async function activateSupportSmsOwnership(params: {
  ticketId: string;
  entryNumber: string;
}) {
  const entryNumber = normalizePhone(params.entryNumber);
  if (!params.ticketId || !entryNumber) return;

  const result = await supabaseAdmin
    .from("support_tickets")
    .select("metadata")
    .eq("id", params.ticketId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return;

  const metadata = (result.data.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  await supabaseAdmin.from("support_tickets").update({
    metadata: {
      ...metadata,
      entry_channel: purposeForTelnyxNumber(entryNumber) || "sms",
      entry_number: entryNumber,
      reply_number: entryNumber,
      handling_department: "support",
      sms_owner_active: true,
      sms_owner_updated_at: now,
    },
    updated_at: now,
  }).eq("id", params.ticketId);
}
