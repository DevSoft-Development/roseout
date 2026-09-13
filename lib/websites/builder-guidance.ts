export type WebsiteLocationContentSummary = {
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  photoCount: number;
  menuItemCount: number;
  reviewCount: number;
  eventCount: number;
  experienceCount: number;
  reservationProvider?: string | null;
  hasReservations: boolean;
};

export type WebsiteBuilderSection = {
  id: string;
  type: string;
  enabled: boolean;
  heading?: string;
  body?: string;
  liveBindings?: string[];
};

export type GuidedDesignChoice = {
  id: string;
  label: string;
  description: string;
  directionId: string | null;
  prompt: string;
};

export const GUIDED_DESIGN_CHOICES: GuidedDesignChoice[] = [
  { id: "auto", label: "Choose for me", description: "Use my business type, photos, and content to choose the best fit.", directionId: null, prompt: "Choose the premium visual direction that best fits this business and its real content." },
  { id: "dark", label: "Dark & upscale", description: "Moody, polished, cinematic, and reservation-forward.", directionId: "refined_after_dark", prompt: "Make the website dark, upscale, cinematic, and polished." },
  { id: "bright", label: "Bright & modern", description: "Clean, fresh, contemporary, and easy to scan.", directionId: "modern_minimal", prompt: "Make the website bright, modern, clean, and contemporary." },
  { id: "warm", label: "Warm & inviting", description: "Welcoming, local, comfortable, and personality-led.", directionId: "warm_neighborhood", prompt: "Make the website warm, inviting, approachable, and polished." },
  { id: "editorial", label: "Elegant & editorial", description: "Premium typography, whitespace, and image-led storytelling.", directionId: "editorial_luxury", prompt: "Make the website elegant, editorial, premium, and image-led." },
  { id: "social", label: "Bold & social", description: "Energetic, visual, group-friendly, and high impact.", directionId: "bold_social", prompt: "Make the website bold, social, energetic, and highly visual." },
];

export const GUIDED_DESIGN_PRIORITIES = [
  { id: "auto", label: "Best overall", prompt: "Balance the experience, business story, and strongest conversion action." },
  { id: "reservations", label: "Reservations / bookings", prompt: "Make reservations or booking the clearest primary action." },
  { id: "photos", label: "Photos / atmosphere", prompt: "Lead with the business-owned photography and atmosphere." },
  { id: "menu", label: "Menu / offerings", prompt: "Make the menu or core offerings easy to discover early." },
  { id: "events", label: "Events / experiences", prompt: "Give published events and experiences strong visibility." },
  { id: "story", label: "Brand / story", prompt: "Lead with the business personality and story before the conversion action." },
] as const;

export function buildGuidedWebsiteVision(input: {
  choiceId: string;
  priorityId: string;
  note?: string;
}) {
  const choice = GUIDED_DESIGN_CHOICES.find((item) => item.id === input.choiceId) || GUIDED_DESIGN_CHOICES[0];
  const priority = GUIDED_DESIGN_PRIORITIES.find((item) => item.id === input.priorityId) || GUIDED_DESIGN_PRIORITIES[0];
  const note = String(input.note || "").trim();
  return {
    directionId: choice.directionId,
    vision: [choice.prompt, priority.prompt, note ? `Owner note: ${note}` : null].filter(Boolean).join(" "),
  };
}

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

export function autofillWebsiteSections<T extends WebsiteBuilderSection>(
  sections: T[],
  locationName: string,
  content: WebsiteLocationContentSummary,
): T[] {
  return sections.map((section) => {
    const existingHeading = typeof section.heading === "string" ? section.heading.trim() : "";
    const existingBody = typeof section.body === "string" ? section.body.trim() : "";
    let heading = existingHeading;
    let body = existingBody;

    switch (section.type) {
      case "hero":
        heading ||= locationName;
        body ||= `Discover ${locationName}, then choose the best way to plan your visit.`;
        break;
      case "about":
        heading ||= `About ${locationName}`;
        body ||= `Get to know ${locationName} and what makes it worth adding to your plans.`;
        break;
      case "gallery":
        heading ||= `See ${locationName}`;
        body ||= content.photoCount > 0
          ? `Explore ${plural(content.photoCount, "business photo")} from ${locationName}.`
          : `Photos added in Edit Location will appear here automatically.`;
        break;
      case "hours":
        heading ||= "Hours";
        body ||= content.hours
          ? "Current business hours stay synced automatically from Edit Location."
          : "Add business hours in Edit Location and they will appear here automatically.";
        break;
      case "menu":
        heading ||= "Explore the menu";
        body ||= content.menuItemCount > 0
          ? `Browse ${plural(content.menuItemCount, "published menu item")} from ${locationName}.`
          : "Publish a menu and current items will appear here automatically.";
        break;
      case "reviews":
        heading ||= "What guests are saying";
        body ||= content.reviewCount > 0
          ? `See ${plural(content.reviewCount, "verified review")} connected to ${locationName}.`
          : "Approved verified reviews will appear here automatically as they become available.";
        break;
      case "reservations":
        heading ||= content.hasReservations ? "Reserve your visit" : "Plan your visit";
        body ||= content.hasReservations
          ? `${content.reservationProvider || "Reservation availability"} is connected and stays synced automatically.`
          : "Connect reservations or booking in Edit Location and availability will appear here automatically.";
        break;
      case "contact":
        heading ||= "Plan your visit";
        body ||= [content.address, content.phone].filter(Boolean).length
          ? `Address and contact details for ${locationName} stay synced from Edit Location.`
          : "Add address and contact details in Edit Location and they will stay synced here.";
        break;
      case "offers":
        heading ||= "Current offers";
        body ||= "Published offers will appear here automatically.";
        break;
      default:
        break;
    }

    return {
      ...section,
      ...(heading ? { heading } : {}),
      ...(body ? { body } : {}),
    };
  });
}
