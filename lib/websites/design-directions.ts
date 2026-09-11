export type WebsiteHeroStyle =
  | "editorial_split"
  | "photo_mosaic"
  | "cinematic_strip"
  | "typography_first"
  | "asymmetric_gallery"
  | "framed_photo";

export type WebsiteDesignDirection = {
  id: string;
  name: string;
  summary: string;
  signals: string[];
  variants: WebsiteHeroStyle[];
  defaultVariant: WebsiteHeroStyle;
  theme: {
    mood: string;
    contrast: "light" | "dark" | "mixed";
    typography: "editorial" | "modern" | "classic" | "playful";
    density: "airy" | "balanced" | "compact";
    imageTreatment: "editorial" | "grid" | "minimal";
    reservationPriority: "primary";
  };
};

export const WEBSITE_DESIGN_DIRECTIONS: WebsiteDesignDirection[] = [
  { id:"editorial_luxury", name:"Editorial Dining", summary:"High-end hospitality with oversized editorial typography, generous whitespace, cinematic food photography, and an intentionally paced guest journey.", signals:["editorial","light","cream","ivory","elegant","refined","magazine","chef","premium","fine dining","tasting menu"], variants:["editorial_split","framed_photo","cinematic_strip","typography_first"], defaultVariant:"editorial_split", theme:{mood:"editorial",contrast:"light",typography:"editorial",density:"airy",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"refined_after_dark", name:"After Dark", summary:"Cinematic nightlife design for lounges, rooftops, cocktail bars, steakhouses, and restaurants where mood and atmosphere sell the experience.", signals:["dark","lounge","romantic","moody","intimate","cocktail","nightlife","luxury","candlelight","upscale","steakhouse","rooftop"], variants:["asymmetric_gallery","cinematic_strip","typography_first","editorial_split"], defaultVariant:"asymmetric_gallery", theme:{mood:"refined",contrast:"dark",typography:"editorial",density:"airy",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"modern_minimal", name:"Contemporary Hospitality", summary:"Crisp, modern hospitality with strong conversion hierarchy, restrained surfaces, and prominent reservation or booking actions.", signals:["modern","clean","reservation","book","minimal","sleek","simple","conversion","contemporary","chef driven"], variants:["typography_first","editorial_split","framed_photo"], defaultVariant:"editorial_split", theme:{mood:"modern",contrast:"light",typography:"modern",density:"balanced",imageTreatment:"minimal",reservationPriority:"primary"}},
  { id:"bold_social", name:"High Energy Social", summary:"Large-scale imagery, bold typography, and energetic rhythm for brunch, nightlife, sports bars, group dining, and social-first venues.", signals:["bold","energetic","social","fun","nightlife","party","vibrant","brunch","groups","lively","sports bar","club"], variants:["photo_mosaic","asymmetric_gallery","cinematic_strip"], defaultVariant:"photo_mosaic", theme:{mood:"energetic",contrast:"dark",typography:"modern",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"classic_bistro", name:"Classic European", summary:"Timeless restaurant design with restrained typography, elegant menu presentation, narrow editorial proportions, and traditional hospitality cues.", signals:["bistro","french","italian","wine bar","brasserie","classic","traditional","european","vintage","trattoria"], variants:["editorial_split","framed_photo","typography_first"], defaultVariant:"editorial_split", theme:{mood:"classic",contrast:"mixed",typography:"classic",density:"balanced",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"coastal_airy", name:"Coastal Escape", summary:"Open, bright, image-led design for seafood, waterfront, rooftop, resort-style, and daylight-driven hospitality concepts.", signals:["coastal","seafood","waterfront","beach","airy","bright","fresh","relaxed","ocean","rooftop","resort"], variants:["framed_photo","editorial_split","cinematic_strip"], defaultVariant:"framed_photo", theme:{mood:"breezy",contrast:"light",typography:"modern",density:"airy",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"warm_neighborhood", name:"Neighborhood Favorite", summary:"Warm, approachable and polished for restaurants, pubs, cafés, and local destinations where personality and familiarity matter most.", signals:["warm","local","neighborhood","friendly","cozy","casual","authentic","welcoming","cafe","pub","family"], variants:["editorial_split","framed_photo","photo_mosaic"], defaultVariant:"editorial_split", theme:{mood:"welcoming",contrast:"light",typography:"classic",density:"balanced",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"luxury_minimal", name:"Quiet Luxury", summary:"Gallery-like restraint, dramatic whitespace, selective imagery, and oversized typography for premium restaurants, spas, and private experiences.", signals:["luxury minimal","minimal luxury","quiet luxury","high end","exclusive","restrained","sophisticated","private","fine dining","spa"], variants:["typography_first","framed_photo","cinematic_strip"], defaultVariant:"typography_first", theme:{mood:"luxury",contrast:"mixed",typography:"editorial",density:"airy",imageTreatment:"minimal",reservationPriority:"primary"}},
  { id:"experiential_escape", name:"Immersive Experience", summary:"Image-forward, action-oriented layouts for escape rooms, bowling, mini golf, attractions, and bookable destinations where the experience is the product.", signals:["experience","activity","immersive","escape room","bowling","mini golf","rooftop","adventure","attraction","book now","arcade","axe throwing"], variants:["asymmetric_gallery","photo_mosaic","cinematic_strip"], defaultVariant:"asymmetric_gallery", theme:{mood:"immersive",contrast:"mixed",typography:"modern",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"creative_workshop", name:"Creative Studio", summary:"Expressive, premium and playful for workshops, maker spaces, classes, date activities, family entertainment, and hands-on venues.", signals:["creative","playful","pottery","painting","candle","cooking class","diy","workshop","studio","colorful","family fun"], variants:["photo_mosaic","framed_photo","editorial_split"], defaultVariant:"photo_mosaic", theme:{mood:"creative",contrast:"light",typography:"playful",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"chef_counter", name:"Chef Counter", summary:"Intimate, food-first storytelling for omakase counters, tasting rooms, chef tables, and small-format concepts where craft is the centerpiece.", signals:["omakase","chef counter","chef table","tasting room","intimate","sushi counter","prix fixe","craft"], variants:["typography_first","editorial_split","framed_photo","cinematic_strip"], defaultVariant:"typography_first", theme:{mood:"crafted",contrast:"mixed",typography:"editorial",density:"airy",imageTreatment:"minimal",reservationPriority:"primary"}},
  { id:"brunch_social", name:"Brunch Social", summary:"Bright, stylish and highly photographic for brunch restaurants, cafés and all-day concepts built around groups and shareable moments.", signals:["brunch","all day cafe","girls brunch","social brunch","mimosas","day party","instagrammable","cafe"], variants:["photo_mosaic","framed_photo","editorial_split","asymmetric_gallery"], defaultVariant:"photo_mosaic", theme:{mood:"sunny",contrast:"light",typography:"modern",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"fast_casual_polished", name:"Polished Fast Casual", summary:"Fast, clear and appetizing for counter service, quick bites, cafés and takeout-forward businesses without making them feel generic.", signals:["fast casual","quick bite","counter service","takeout","grab and go","sandwich","burger","wings","bakery"], variants:["framed_photo","photo_mosaic","typography_first"], defaultVariant:"framed_photo", theme:{mood:"direct",contrast:"light",typography:"modern",density:"compact",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"competitive_social", name:"Competitive Social", summary:"High-energy premium design for bowling, darts, billiards, axe throwing, mini golf and social gaming venues.", signals:["competitive social","darts","billiards","bowling","axe throwing","mini golf","games","groups","corporate events"], variants:["cinematic_strip","asymmetric_gallery","photo_mosaic","typography_first"], defaultVariant:"cinematic_strip", theme:{mood:"competitive",contrast:"dark",typography:"modern",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"family_entertainment", name:"Family Entertainment", summary:"Energetic but polished for arcades, family attractions, indoor play, museums and all-ages entertainment destinations.", signals:["family entertainment","kids","all ages","arcade","indoor play","family fun","birthday parties","museum"], variants:["photo_mosaic","framed_photo","cinematic_strip"], defaultVariant:"photo_mosaic", theme:{mood:"friendly",contrast:"light",typography:"playful",density:"balanced",imageTreatment:"grid",reservationPriority:"primary"}},
  { id:"wellness_retreat", name:"Wellness Retreat", summary:"Calm, tactile and spacious for spas, wellness studios, bathhouses and restorative experiences.", signals:["wellness","spa","massage","sauna","bathhouse","retreat","relaxing","self care","meditation"], variants:["framed_photo","typography_first","editorial_split","cinematic_strip"], defaultVariant:"framed_photo", theme:{mood:"calm",contrast:"light",typography:"editorial",density:"airy",imageTreatment:"minimal",reservationPriority:"primary"}},
  { id:"arts_culture", name:"Arts & Culture", summary:"Curatorial, editorial presentation for museums, galleries, theaters, cultural institutions and performance venues.", signals:["museum","gallery","theater","theatre","arts","culture","exhibition","performance","jazz","live music"], variants:["typography_first","asymmetric_gallery","editorial_split","cinematic_strip"], defaultVariant:"typography_first", theme:{mood:"curated",contrast:"mixed",typography:"editorial",density:"airy",imageTreatment:"editorial",reservationPriority:"primary"}},
  { id:"cinematic_entertainment", name:"Cinematic Entertainment", summary:"Dramatic, immersive presentation for theaters, comedy venues, live shows, nightlife attractions and ticketed entertainment.", signals:["cinema","movie theater","comedy","show","live entertainment","performance","tickets","night out"], variants:["cinematic_strip","typography_first","asymmetric_gallery"], defaultVariant:"cinematic_strip", theme:{mood:"cinematic",contrast:"dark",typography:"modern",density:"balanced",imageTreatment:"editorial",reservationPriority:"primary"}},
];

const LEGACY_DIRECTION_ALIASES: Record<string, string> = {
  cocktail_society: "refined_after_dark",
  experiential_escape: "experiential_escape",
  natural_retreat: "coastal_airy",
  playful_local: "creative_workshop",
  industrial_edge: "bold_social",
  heritage_story: "classic_bistro",
  contemporary_culture: "editorial_luxury",
  high_energy_experience: "experiential_escape",
  competitive_social: "experiential_escape",
  immersive_adventure: "experiential_escape",
  family_fun: "creative_workshop",
  wellness_escape: "luxury_minimal",
};

export function normalizeWebsiteDesignDirectionId(id: string) {
  return LEGACY_DIRECTION_ALIASES[id] || id;
}

export function getWebsiteDesignDirection(id: string) {
  const normalized = normalizeWebsiteDesignDirectionId(id);
  return WEBSITE_DESIGN_DIRECTIONS.find((direction) => direction.id === normalized) || null;
}
