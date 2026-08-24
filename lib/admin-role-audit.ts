import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminRoleAuditEvent = {
  id: string;
  actor_email: string | null;
  actor_role: string | null;
  target_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
};

export async function listAdminRoleAuditEvents(limit = 40): Promise<AdminRoleAuditEvent[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_audit_logs")
    .select("id,actor_email,actor_role,target_email,action,entity_type,entity_id,summary,created_at")
    .in("entity_type", ["admin_role", "admin_role_policy"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as AdminRoleAuditEvent[];
}
