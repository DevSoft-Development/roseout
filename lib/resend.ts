import "server-only";

import { sendEmailViaIntegrationApi } from "@/lib/aws/integration-api";

type EmailInput = {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
};

export const resend = {
  emails: {
    async send(input: EmailInput) {
      try {
        const result = await sendEmailViaIntegrationApi({
          ...input,
          replyTo: Array.isArray(input.replyTo) ? input.replyTo[0] : input.replyTo,
        });
        return { data: { id: result.id }, error: null };
      } catch (error) {
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  },
};
