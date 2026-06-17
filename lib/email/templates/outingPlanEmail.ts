import { renderBrandedEmail } from "@/lib/email/render";
import type { EmailSection } from "@/lib/email/types";

type OutingEmailLocation = {
  restaurant_name?: string | null;
  activity_name?: string | null;
  name?: string | null;
  title?: string | null;
} | null;

type RenderOutingPlanEmailInput = {
  planTitle?: string | null;
  planUrl: string;
  restaurant?: OutingEmailLocation;
  activity?: OutingEmailLocation;
  plannedFor?: string | null;
  timezone?: string | null;
  outingDateContext?: string | null;
  outingDateTimeText?: string | null;
};

function locationName(location: OutingEmailLocation, fallback: string) {
  if (!location) return fallback;
  return location.restaurant_name || location.activity_name || location.name || location.title || fallback;
}

function formatTiming(input: RenderOutingPlanEmailInput) {
  if (input.outingDateTimeText) return input.outingDateTimeText;
  if (input.plannedFor) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: input.timezone || "America/New_York",
      }).format(new Date(input.plannedFor));
    } catch {
      return input.plannedFor;
    }
  }
  return input.outingDateContext || null;
}

export function renderOutingPlanEmail(input: RenderOutingPlanEmailInput) {
  const sections: EmailSection[] = [
    {
      type: "paragraph",
      text: "Your plan is saved. You can open it anytime to call, reserve, view websites, or get directions.",
    },
    {
      type: "infoList",
      title: "Your Picks",
      items: [
        { label: "Plan", value: input.planTitle || "Your TheOutHaven Plan" },
        { label: "Restaurant", value: locationName(input.restaurant || null, "Not selected") },
        { label: "Activity", value: locationName(input.activity || null, "Not selected") },
        ...(formatTiming(input) ? [{ label: "Outing time", value: formatTiming(input) as string }] : []),
      ],
    },
    {
      type: "callout",
      title: "Booking tip",
      text: "We recommend confirming reservations or tickets directly with each location before you head out.",
      tone: "info",
    },
  ];

  return renderBrandedEmail({
    department: "plans",
    subject: "Your TheOutHaven outing plan is ready",
    preview: "Your outing plan is saved — review your picks and booking details.",
    heading: "Your outing is ready",
    eyebrow: "Outing Plan",
    intro: "Here’s your saved TheOutHaven plan. Use your secure plan link to review booking details, directions, and next steps.",
    sections,
    cta: { label: "Open My Outing Plan", url: input.planUrl },
    footerNote: "Thanks for planning with TheOutHaven.",
  });
}
