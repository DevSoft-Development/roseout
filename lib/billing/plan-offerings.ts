export type PlanFeature = readonly [feature: string, essentials: string, partnerPro: string];
export type PlanFeatureGroup = { title: string; features: readonly PlanFeature[] };

export const ESSENTIALS_PLAN_NAME = "Essentials";
export const PARTNER_PRO_PLAN_NAME = "Partner Pro";

export const essentialsFeatures = [
  "Show up when guests search for outings on TheOutHaven",
  "Claim and manage your verified business profile",
  "Create and publish events on your public location page",
  "Create and publish bookable experiences",
  "Keep photos, contact details, and business information accurate",
  "Send guests to your phone, website, or existing reservation link",
  "Turn profile views into calls, clicks, saves, and shares",
] as const;

export const planFeatureGroups = [
  {
    title: "Discovery and business profile",
    features: [
      ["Claimed and verified business profile", "Included", "Included"],
      ["Placement in TheOutHaven search", "Standard", "Boosted"],
      ["AI-powered discovery", "Limited", "Priority"],
      ["Business photos", "1 photo", "Up to 10 photos"],
      ["Business details and contact links", "Core details", "Menu, website, phone and socials"],
      ["Branding workspace", "—", "Included"],
      ["Menu and package management", "—", "Included"],
      ["QR growth tools", "—", "Included"],
    ],
  },
  {
    title: "Events and experiences",
    features: [
      ["Create and publish events", "Included", "Included"],
      ["Public event pages with custom slugs", "Included", "Included"],
      ["Create and publish experiences", "Included", "Included"],
      ["Public experience pages with custom slugs", "Included", "Included"],
      ["Show events and experiences on location profile", "Included", "Included"],
      ["Show events and experiences on hosted website", "Included", "Included"],
      ["Event ticket sales and attendee management", "Basic", "Full management"],
      ["Event sales and revenue analytics", "Basic", "Included"],
      ["Experience availability, bookings and check-in", "Basic", "Full management"],
      ["Experience performance analytics", "Basic", "Included"],
    ],
  },
  {
    title: "Reservations and venue operations",
    features: [
      ["TheOutHaven Reserve bookings", "—", "Included"],
      ["Hosted reservation portal", "—", "Included"],
      ["Website reservation embed", "—", "Included"],
      ["Availability and booking hours", "—", "Included"],
      ["Location layout builder and live map", "—", "Included"],
      ["Hostess and operator view", "—", "Included"],
      ["Reservation and waitlist dashboard", "—", "Included"],
      ["SMS confirmations and reminders", "—", "Included"],
      ["Waitlist texting and table-ready messages", "—", "Included"],
      ["Add-to-calendar links", "—", "Included"],
      ["Reservation deposits and Stripe payouts", "—", "Available"],
    ],
  },
  {
    title: "Guests, marketing and growth",
    features: [
      ["Guest details and private notes", "—", "Included"],
      ["Lead tracking", "—", "Included"],
      ["Offers and promotions", "—", "Included"],
      ["VIP list tools", "—", "Included"],
      ["Guest messaging", "—", "Included"],
      ["Reviews and feedback workspace", "—", "Included"],
      ["Marketing Studio", "—", "Included"],
      ["Business notifications", "—", "Included"],
      ["Analytics", "Profile views", "Views, clicks, bookings and sales"],
    ],
  },
] as const satisfies readonly PlanFeatureGroup[];

export const featureDescriptions: Record<string, string> = {
  "Claimed and verified business profile": "Take ownership of your location page and display verified business information.",
  "Placement in TheOutHaven search": "Control how prominently your location can appear when guests search for outings.",
  "AI-powered discovery": "Helps TheOutHaven recommend your location when it matches a guest’s request.",
  "Business photos": "Show guests what your location, atmosphere, food, or experience looks like.",
  "Business details and contact links": "Keep important details and direct contact channels available from your profile.",
  "Branding workspace": "Manage the visual identity and branded content guests see across your business tools.",
  "Menu and package management": "Publish and update menus, packages, and other offerings.",
  "QR growth tools": "Create QR codes that send guests to your profile, booking flow, offers, or reviews.",
  "Create and publish events": "Create location-owned events and publish them directly to TheOutHaven.",
  "Public event pages with custom slugs": "Use a readable event URL generated from the event name or choose your own available slug.",
  "Create and publish experiences": "Create bookable experiences with pricing, guest limits, availability, and a public page.",
  "Public experience pages with custom slugs": "Use a readable experience URL generated from the experience name or choose your own available slug.",
  "Show events and experiences on location profile": "Published offerings automatically appear on your public TheOutHaven location page.",
  "Show events and experiences on hosted website": "Published offerings automatically sync to your TheOutHaven-hosted website.",
  "Event ticket sales and attendee management": "Sell or issue tickets and manage attendees and check-in from the location dashboard.",
  "Event sales and revenue analytics": "Track tickets, gross sales, location net estimates, and event performance.",
  "Experience availability, bookings and check-in": "Add bookable times, manage guest bookings, and track arrivals.",
  "Experience performance analytics": "Track bookings, booked guests, check-ins, upcoming inventory, and estimated booking value.",
  "TheOutHaven Reserve bookings": "Accept and manage reservations directly through TheOutHaven.",
  "Hosted reservation portal": "Give guests a dedicated TheOutHaven page where they can book your location.",
  "Website reservation embed": "Add TheOutHaven’s booking experience directly to your existing website.",
  "Availability and booking hours": "Set the days, times, capacity, and rules that control when guests can reserve.",
  "Location layout builder and live map": "Create a visual floor layout and track tables or reservable areas in real time.",
  "Hostess and operator view": "Use an operations-focused screen to seat guests and manage daily service.",
  "Reservation and waitlist dashboard": "View upcoming bookings, arrivals, cancellations, and waiting guests in one place.",
  "SMS confirmations and reminders": "Automatically text guests booking confirmations and reminders before their visit.",
  "Waitlist texting and table-ready messages": "Notify waiting guests by text when their table or reserved area is ready.",
  "Add-to-calendar links": "Let guests add confirmed reservations to their preferred calendar.",
  "Reservation deposits and Stripe payouts": "Collect eligible booking deposits and receive funds through connected Stripe payouts.",
  "Guest details and private notes": "Keep useful guest information and internal service notes available to your team.",
  "Lead tracking": "Track potential customers and inquiries from first interest through conversion.",
  "Offers and promotions": "Create promotions that encourage guests to visit, book, or return.",
  "VIP list tools": "Organize priority guests and provide your team with helpful VIP context.",
  "Guest messaging": "Communicate with guests about reservations, updates, and service-related needs.",
  "Reviews and feedback workspace": "Monitor guest feedback and manage review-related follow-up from one workspace.",
  "Marketing Studio": "Create and manage branded marketing content and guest-growth campaigns.",
  "Business notifications": "Receive alerts about bookings, guest activity, and actions that need attention.",
  Analytics: "Measure profile views, engagement, booking activity, event sales, and other business results.",
};

export const essentialsIncludedFeatures = planFeatureGroups.flatMap((group) =>
  group.features.filter(([, essentials]) => essentials !== "—").map(([feature, essentials]) => ({ feature, essentials })),
);

export const partnerProDowngradeChanges = planFeatureGroups.flatMap((group) =>
  group.features.filter(([, essentials, partnerPro]) => essentials !== partnerPro).map(([feature, essentials, partnerPro]) => ({ feature, essentials, partnerPro })),
);
