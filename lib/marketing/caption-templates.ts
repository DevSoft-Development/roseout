export const captionCategories = [
  "hidden restaurants",
  "rooftop spots",
  "romantic date ideas",
  "cheap vs luxury dates",
  "things to do tonight",
  "NYC hidden gems",
  "POV date night",
  "birthday spots",
  "hookah lounges",
  "brunch places",
  "activities within walking distance",
  "perfect first date",
  "3 places in one night",
  "girls night out",
  "anniversary date",
  "late-night food",
  "dinner and drinks",
  "dinner plus activity",
  "rainy day date",
  "luxury date night",
  "affordable date night",
  "weekend plans",
  "first date ideas",
  "after dinner activities",
] as const;

export type CaptionCategory = (typeof captionCategories)[number];

export const captionHooks = [
  "Places in NYC that don’t feel like NYC",
  "Date ideas for couples tired of dinner dates",
  "Late-night spots that are actually worth it",
  "Best places to take someone you REALLY like",
  "Cheap date vs luxury date in the same neighborhood",
  "Underrated NYC restaurants nobody talks about",
  "Perfect birthday dinner spots in NYC",
  "NYC rooftops that look straight out of Miami",
  "Dinner + hookah spots walking distance apart",
  "Best girls night spots in NYC",
  "What to do after dinner in NYC",
  "Romantic places that don’t feel cheesy",
  "Best first-date spots if you want a second date",
  "If your date takes you here… they planned ahead 👀",
  "Fun NYC dates that AREN’T just drinks",
  "NYC spots that look expensive but aren’t",
  "Places that make you forget you’re in Queens",
  "A perfect NYC night under $100",
  "Where to go when you don’t know where to go tonight",
  "One neighborhood. Three perfect stops.",
  "Best rooftop + dinner combinations",
  "Hookah lounges with actual good food",
  "Perfect rainy-day NYC date ideas",
  "NYC date ideas after 10PM",
  "Spots that deserve more hype",
  "Your next favorite restaurant is probably this one",
  "The type of place you accidentally stay at for 5 hours",
  "Best brunch spots for birthdays",
  "Places that feel like a movie scene",
  "Perfect spots for soft-launching your relationship 😭",
  "Dinner spots with the BEST ambiance",
  "Hidden gems near you tonight",
  "Perfect anniversary spots in NYC",
  "Places that look good in EVERY photo",
  "If you like aesthetic restaurants, save this",
  "Restaurants worth crossing boroughs for",
  "Things to do tonight besides the club",
  "Best places to go when you want a vibe",
  "This rooftop at sunset is unreal",
  "A date-night itinerary already planned for you",
  "The perfect night out without overthinking it",
  "The best walkable dinner + activity combinations",
  "Where to eat before a night out",
  "Underrated late-night food spots",
  "Your sign to stop going to chain restaurants",
  "Perfect date night if you hate planning",
  "NYC spots that actually live up to the hype",
  "This might be the perfect first date",
  "Places you bookmark immediately",
  "Save this for your next NYC night out",
] as const;

export const linkInBioCtas = [
  "Find more on TheOutHaven 🔗 Link in bio",
  "Plan it on TheOutHaven — Link in bio",
  "Save this and tap the link in bio when you’re ready",
  "Your next plan is waiting. Link in bio 👀",
] as const;

export const ctaStyles = [
  "Save this for your next night out 👀",
  "Who are you bringing here?",
  "Send this to the friend who always says ‘I’m down.’",
  "Bookmark this before everyone finds out.",
  "Use this as your no-stress night-out plan.",
] as const;

export const hashtagGroups: Record<CaptionCategory, string[]> = {
  "hidden restaurants": ["#NYCHiddenGems", "#NYCRestaurants", "#TheOutHaven"],
  "rooftop spots": ["#NYCRooftops", "#NYCNightlife", "#TheOutHaven"],
  "romantic date ideas": ["#DateNightNYC", "#NYCDateIdeas", "#TheOutHaven"],
  "cheap vs luxury dates": ["#NYCDateIdeas", "#AffordableNYC", "#TheOutHaven"],
  "things to do tonight": ["#ThingsToDoNYC", "#NYCNightlife", "#TheOutHaven"],
  "NYC hidden gems": ["#NYCHiddenGems", "#DateNightNYC", "#TheOutHaven"],
  "POV date night": ["#POVDateNight", "#NYCDateIdeas", "#TheOutHaven"],
  "birthday spots": ["#BirthdayDinner", "#NYCRestaurants", "#TheOutHaven"],
  "hookah lounges": ["#NYCHookah", "#DinnerAndHookah", "#TheOutHaven"],
  "brunch places": ["#NYCBrunch", "#BirthdayBrunch", "#TheOutHaven"],
  "activities within walking distance": ["#WalkableNYC", "#ThingsToDoNYC", "#TheOutHaven"],
  "perfect first date": ["#FirstDateIdeas", "#DateNightNYC", "#TheOutHaven"],
  "3 places in one night": ["#ThingsToDoNYC", "#NYCFoodie", "#DateNight"],
  "girls night out": ["#GirlsNightNYC", "#NYCNightlife", "#TheOutHaven"],
  "anniversary date": ["#AnniversaryDate", "#RomanticNYC", "#TheOutHaven"],
  "late-night food": ["#LateNightFood", "#NYCFoodie", "#TheOutHaven"],
  "dinner and drinks": ["#DinnerAndDrinks", "#NYCRestaurants", "#TheOutHaven"],
  "dinner plus activity": ["#DateNightNYC", "#ThingsToDoNYC", "#TheOutHaven"],
  "rainy day date": ["#RainyDayDate", "#NYCDateIdeas", "#TheOutHaven"],
  "luxury date night": ["#LuxuryDateNight", "#NYCRestaurants", "#TheOutHaven"],
  "affordable date night": ["#AffordableDateNight", "#NYCDateIdeas", "#TheOutHaven"],
  "weekend plans": ["#WeekendPlans", "#ThingsToDoNYC", "#TheOutHaven"],
  "first date ideas": ["#FirstDateIdeas", "#DateNightNYC", "#TheOutHaven"],
  "after dinner activities": ["#AfterDinner", "#ThingsToDoNYC", "#TheOutHaven"],
};

export const platformRules = {
  instagram: {
    allowRawUrls: false,
    cta: "Link in bio",
    note: "Instagram captions should never contain raw URLs.",
  },
  tiktok: {
    allowRawUrls: false,
    cta: "Link in bio",
    note: "TikTok captions should never contain raw URLs.",
  },
  youtube: {
    allowRawUrls: true,
    cta: "Use the full URL in the description.",
  },
  email: {
    allowRawUrls: true,
    cta: "Use clickable full links.",
  },
  sms: {
    allowRawUrls: true,
    cta: "Use short branded links.",
  },
} as const;

export type MarketingSocialPackage = {
  instagram_caption: string;
  tiktok_caption: string;
  youtube_title: string;
  youtube_description: string;
  email_subject: string;
  email_body: string;
  sms_body: string;
  caption_category: CaptionCategory;
  hook: string;
  link_in_bio_cta: string;
  short_link: string;
  full_url: string;
};

export type CaptionTemplateInput = {
  locationName?: string;
  category?: string;
  city?: string;
  state?: string;
  address?: string;
  description?: string;
  fullUrl?: string;
  captionCategory?: string;
};

const rawUrlPattern = /(?:https?:\/\/|www\.)\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i;

function stableIndex(seed: string, length: number) {
  if (length <= 0) return 0;
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) total += seed.charCodeAt(index) * (index + 1);
  return Math.abs(total) % length;
}

function normalizeText(value: string | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function normalizeCaptionCategory(value: string | undefined, seed: string): CaptionCategory {
  if (captionCategories.includes(value as CaptionCategory)) return value as CaptionCategory;
  return captionCategories[stableIndex(seed, captionCategories.length)];
}

function brandedSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "plan";
}

export function buildShortBrandedLink(fullUrl: string, locationName = "plan") {
  const slug = brandedSlug(locationName);
  try {
    const parsed = new URL(fullUrl);
    const id = parsed.pathname.split("/").filter(Boolean).pop() || slug;
    return `https://tohvn.com/${brandedSlug(id).slice(0, 18) || slug}`;
  } catch {
    return `https://tohvn.com/${slug}`;
  }
}

function placeLine(city: string, state: string) {
  return [city, state].filter(Boolean).join(", ");
}

function selectedTemplate(category: CaptionCategory, hook: string, name: string, place: string, linkInBioCta: string) {
  const templateNumber = stableIndex(`${category}:${hook}:${name}`, 6);
  const locationLine = place ? `${name} in ${place}` : name;

  const templates = [
    `🔥 Hidden NYC spots you almost don’t want to tell people about\n\n✨ Date-night energy is unmatched\n\n${ctaStyles[0]}\n\n${hashtagGroups[category].join(" ")}`,
    `POV: You finally stopped going to the same boring places 😭✨\n\nTonight’s lineup:\n🍸 cocktails\n🍽 amazing food\n🌃 rooftop vibes\n\n${ctaStyles[1]}\n\n${hashtagGroups[category].join(" ")}`,
    `3 spots.\n1 night.\nPerfect NYC vibe. 🌆✨\n\n✔ dinner\n✔ drinks\n✔ late-night activity\n\n${linkInBioCta}\n\n${hashtagGroups[category].join(" ")}`,
    `${hook}\n\nStart with ${locationLine} and build the rest of the night around the vibe. ✨\n\n${linkInBioCta}\n\n${hashtagGroups[category].join(" ")}`,
    `If you’re tired of “where should we go?” texts, this is the move.\n\n📍 ${locationLine}\n✨ ${category}\n🖤 easy TheOutHaven plan\n\n${ctaStyles[3]}\n\n${hashtagGroups[category].join(" ")}`,
    `Your next saved plan: ${locationLine}.\n\nThe vibe: ${category}\nThe reason: nobody wants another boring night out\nThe move: ${linkInBioCta}\n\n${hashtagGroups[category].join(" ")}`,
  ];

  return templates[templateNumber];
}

function stripRawUrls(text: string) {
  return text.replace(rawUrlPattern, "Link in bio").replace(/(?:Link in bio\s*){2,}/gi, "Link in bio").trim();
}

export function hasRawUrl(text: string) {
  return rawUrlPattern.test(text);
}

export function buildMarketingSocialPackage(input: CaptionTemplateInput): MarketingSocialPackage {
  const hasLocation = Boolean(input.locationName?.trim());
  const locationName = normalizeText(input.locationName, "TheOutHaven");
  const city = normalizeText(input.city);
  const state = normalizeText(input.state);
  const category = normalizeCaptionCategory(input.captionCategory || input.category, `${locationName}:${city}:${input.description || ""}`);
  const fullUrl = normalizeText(input.fullUrl, "https://theouthaven.com");
  const hook = captionHooks[stableIndex(`${category}:${locationName}:${city}`, captionHooks.length)];
  const linkInBioCta = linkInBioCtas[stableIndex(`${hook}:${locationName}`, linkInBioCtas.length)];
  const shortLink = buildShortBrandedLink(fullUrl, locationName);
  const place = placeLine(city, state);
  const locationLine = place ? `${locationName} in ${place}` : locationName;
  const categoryLabel = category.replace(/\b\w/g, (letter) => letter.toUpperCase());
  const baseCaption = selectedTemplate(category, hook, locationName, place, linkInBioCta);
  const instagramCaption = stripRawUrls(hasLocation
    ? `POV: date night at ${locationName} hits different ✨

Dinner, drinks, and the perfect vibe for your next night out.

${linkInBioCta}

${hashtagGroups[category].join(" ")}`
    : (baseCaption.includes("Link in bio") ? baseCaption : `${baseCaption}

${linkInBioCta}`));
  const tiktokCaption = stripRawUrls(hasLocation
    ? `${locationName} might be your next date-night move 👀

Would you go here?

Search it on TheOutHaven 🔗 Link in bio

${hashtagGroups[category].slice(0, 3).join(" ")}`
    : `POV: ${hook.toLowerCase()} ✨

TheOutHaven is where you find the kind of ${category} plans people save immediately.

${linkInBioCta}

${hashtagGroups[category].slice(0, 3).join(" ")}`);
  const youtubeTitle = (hasLocation ? `Date Night at ${locationName}` : `${categoryLabel} from TheOutHaven`).slice(0, 90);
  const youtubeDescription = hasLocation
    ? `Plan this outing on TheOutHaven: ${fullUrl}

${locationLine} is ready for your next night out.

${hashtagGroups[category].join(" ")}`
    : `Plan your next outing on TheOutHaven: ${fullUrl}

${hook}.

${hashtagGroups[category].join(" ")}`;
  const emailSubject = hasLocation ? `Your next date night idea: ${locationName}` : "Your next date night idea from TheOutHaven";
  const emailBody = hasLocation
    ? `Looking for ${category}? ${locationLine} is ready for your next TheOutHaven night out.

${hook}.

See the full listing and plan your outing: ${fullUrl}`
    : `Looking for ${category}? TheOutHaven helps you find a plan that fits the vibe.

${hook}.

Start planning here: ${fullUrl}`;
  const smsBody = hasLocation
    ? `Date idea: ${locationName}. Plan it here: ${shortLink} Reply STOP to opt out.`
    : `Date idea from TheOutHaven. Plan it here: ${shortLink} Reply STOP to opt out.`;

  return {
    instagram_caption: instagramCaption,
    tiktok_caption: tiktokCaption,
    youtube_title: youtubeTitle,
    youtube_description: youtubeDescription,
    email_subject: emailSubject,
    email_body: emailBody,
    sms_body: smsBody,
    caption_category: category,
    hook,
    link_in_bio_cta: linkInBioCta,
    short_link: shortLink,
    full_url: fullUrl,
  };
}
