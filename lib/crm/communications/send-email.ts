import "server-only";

import { resend } from "@/lib/resend";
import { resolveLoggedInEmailSender } from "./resolve-logged-in-email-sender";

type SendCrmEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  communicationType: string;
};

export async function sendCrmEmail(input: SendCrmEmailInput) {
  const sender = await resolveLoggedInEmailSender();

  if (
    !sender.allowedCommunicationTypes.includes(input.communicationType)
  ) {
    throw new Error(
      `You are not authorized to send ${input.communicationType} email.`,
    );
  }

  const { data, error } = await resend.emails.send({
    from: sender.from,
    to: [input.to],
    replyTo: sender.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(error.message || "The email could not be sent.");
  }

  return {
    providerMessageId: data?.id ?? null,
    senderUserId: sender.userId,
    senderEmail: sender.emailAddress,
    replyTo: sender.replyTo,
  };
}