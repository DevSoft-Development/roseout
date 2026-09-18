import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type EmailLogInput = Record<string, unknown> & {
  template_key?: string;
  recipient_email?: string;
  status?: string;
};

export async function recordEmailSendLog(input: EmailLogInput) {
  try {
    await getAdminDatabaseClient()
      .from("email_send_logs")
      .insert({ metadata: {}, ...input });
  } catch (error) {
    console.warn("email_send_logs insert skipped", error);
  }
}
