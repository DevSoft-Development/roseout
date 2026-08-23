import "server-only";

import { syncMicrosoft365ForUser } from "./sync";
import { syncMicrosoft365TasksWithCrm } from "./task-crm-sync";

export async function syncMicrosoft365WorkspaceForUser(userId: string) {
  const base = await syncMicrosoft365ForUser(userId);
  const crmTasks = await syncMicrosoft365TasksWithCrm(userId);
  return { ...base, crmTasks };
}
