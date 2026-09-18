import "server-only";

import {
  platformCoreApiConfigured,
  readSupportCaseViaCoreApi,
} from "@/lib/aws/core-api";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

async function getSupportCaseLocally(id: string) {
  const db = getAdminDatabaseClient();
  const [{ data: ticket, error }, { data: messages }, { data: activities }] = await Promise.all([
    db.from("support_tickets").select("*").eq("id", id).single(),
    db.from("support_ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
    db.from("crm_activities").select("*").eq("source_record_id", id).order("occurred_at", { ascending: false }).limit(100),
  ]);
  if (error) throw error;
  return { ticket, messages: messages ?? [], activities: activities ?? [] };
}

export async function getSupportCase(id: string) {
  if (platformCoreApiConfigured()) {
    try {
      return await readSupportCaseViaCoreApi(id);
    } catch (error) {
      console.warn("Core support case unavailable; using local fallback", error);
    }
  }
  return getSupportCaseLocally(id);
}
