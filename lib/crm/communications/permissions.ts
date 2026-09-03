import "server-only";
import type { AdminRole } from "@/lib/users/roles";
const READ_ONLY = new Set<AdminRole>(["reviewer", "viewer"]);
export function canSend(role: AdminRole) { return !READ_ONLY.has(role) && role !== "editor"; }
export function canApprove(role: AdminRole) { return role === "superadmin" || role === "admin" || role === "manager"; }
export function assertApproval(actor: { id: string; role: AdminRole }, request: { requestedBy: string }, overrideReason?: string) {
  if (!canApprove(actor.role)) throw new Error("Role cannot approve communications");
  if (actor.id === request.requestedBy && !(actor.role === "superadmin" && overrideReason?.trim())) throw new Error("Self-approval is not permitted");
}
