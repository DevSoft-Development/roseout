import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type LocationCrmCommunication = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  from_address: string | null;
  to_address: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

function isCrmCommunication(row: any) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const sourceSystem = String((metadata as any).source_system || "").toLowerCase();
  const sourceTable = String((metadata as any).source_table || "").toLowerCase();
  const assignedTeam = String((metadata as any).assigned_team || "").toLowerCase();

  if (assignedTeam === "reservations" || assignedTeam === "support") return false;
  if (sourceSystem.startsWith("reservation") || sourceSystem.startsWith("support")) return false;

  return (
    sourceSystem.startsWith("crm") ||
    sourceTable === "location_claim_codes" ||
    Boolean((metadata as any).crm_activity_id)
  );
}

export async function listLocationCrmCommunications(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("communication_logs")
    .select("id,channel,direction,subject,body,status,from_address,to_address,created_at,metadata")
    .eq("recipient_type", "location")
    .eq("recipient_id", locationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []).filter(isCrmCommunication) as LocationCrmCommunication[];
}
