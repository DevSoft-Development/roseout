import { sendNotification } from "@/lib/notifications";
import { getAdminNotifyEmail } from "@/lib/adminEmail";
import { createSupportTicket, renderSupportEmail, supportEmailFrom } from "@/lib/support";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(value: string) {
  return htmlEscape(value).replace(/\n/g, "<br />");
}

async function sendContactFallback({
  name,
  email,
  topic,
  message,
  errorMessage,
}: {
  name: string;
  email: string;
  topic: string;
  message: string;
  errorMessage: string;
}) {
  const adminEmail = getAdminNotifyEmail();

  if (!adminEmail) return;

  await sendNotification({
    toEmail: adminEmail,
    subject: `New RoseOut contact message: ${topic || "General"}`,
    from: supportEmailFrom(),
    emailHtml: renderSupportEmail({
      title: "New contact message",
      greeting: "Hi team,",
      bodyHtml: `
        <p style="margin:0 0 44px;">A contact form message was delivered, but the support ticket fallback was needed.</p>
        <p style="margin:0 0 18px;"><strong>Ticket error:</strong> ${htmlEscape(errorMessage)}</p>
        <p style="margin:0 0 18px;"><strong>Name:</strong> ${htmlEscape(name)}</p>
        <p style="margin:0 0 18px;"><strong>Email:</strong> ${htmlEscape(email)}</p>
        <p style="margin:0 0 44px;"><strong>Topic:</strong> ${htmlEscape(topic || "General")}</p>
        <p style="margin:0 0 18px;"><strong>Message:</strong></p>
        <p style="margin:0;">${nl2br(message)}</p>
      `,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const topic = clean(body.topic);
    const message = clean(body.message);
    const captchaToken = clean(body.captchaToken);

    if (!name || !email || !message) {
      return Response.json(
        { error: "Name, email, and message are required." },
        { status: 400 }
      );
    }

    if (!captchaToken) {
      return Response.json(
        { error: "Please complete the captcha." },
        { status: 400 }
      );
    }

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY || "",
          response: captchaToken,
        }),
      }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      return Response.json(
        { error: "Captcha verification failed." },
        { status: 400 }
      );
    }

    try {
      const ticket = await createSupportTicket({
        name,
        email,
        topic: topic || "Contact Form",
        subject: `Contact form: ${topic || "General"}`,
        message,
        source: "contact_form",
      });

      return Response.json({
        success: true,
        ticketId: ticket.id,
        ticketUrl: `/support/tickets/${ticket.id}?key=${ticket.public_access_token}`,
        message: "Support ticket created. We’ll get back to you shortly.",
      });
    } catch (supportError: unknown) {
      const errorMessage = supportError instanceof Error
        ? supportError.message
        : "Unknown support ticket error";

      console.error("Contact support ticket creation failed", supportError);

      await sendContactFallback({
        name,
        email,
        topic,
        message,
        errorMessage,
      });

      return Response.json({
        success: true,
        ticketId: null,
        ticketUrl: null,
        message: "Message sent. We’ll get back to you shortly.",
      });
    }
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}
