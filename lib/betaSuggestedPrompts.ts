export type BetaSuggestedPrompt = {
  id: string;
  label: string;
  prompt: string;
  recommendedPath: string;
  notes?: string;
};

export type BetaSuggestedPromptCategory = {
  id: string;
  label: string;
  description: string;
  prompts: BetaSuggestedPrompt[];
};

export const betaSuggestedPromptCategories: BetaSuggestedPromptCategory[] = [
  {
    id: "quality_targets",
    label: "Quality Targets",
    description:
      "Prompts that check category matching, intent parsing, and result quality.",
    prompts: [
      {
        id: "quality-theater-filter",
        label: "Theater filtering",
        prompt: "group dinner and drinks",
        recommendedPath: "/create",
        notes:
          "Results should not be mostly theaters unless the search clearly asks for a show, theater, or performance.",
      },
      {
        id: "edge-not-theater",
        label: "Restaurant intent",
        prompt: "group dinner with cocktails not a theater",
        recommendedPath: "/create",
      },
    ],
  },
  {
    id: "group_night",
    label: "Group Night",
    description:
      "Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.",
    prompts: [
      {
        id: "group-night-dinner-drinks",
        label: "Group dinner + drinks",
        prompt: "group dinner and drinks",
        recommendedPath: "/create",
        notes:
          "Important test. Should not over-return theaters unless clearly relevant.",
      },
      {
        id: "group-night-lounge",
        label: "Group dinner + lounge",
        prompt: "group dinner and lounge after",
        recommendedPath: "/create",
      },
      {
        id: "group-night-cocktails",
        label: "Cocktails outing",
        prompt: "cocktails and fun food for a group night",
        recommendedPath: "/create",
      },
      {
        id: "group-night-birthday",
        label: "Birthday group night",
        prompt: "birthday group dinner and activity",
        recommendedPath: "/create",
      },
      {
        id: "group-night-brunch",
        label: "Group brunch",
        prompt: "group brunch and something fun after",
        recommendedPath: "/create",
      },
      {
        id: "group-night-upscale",
        label: "Upscale group night",
        prompt: "upscale group dinner and drinks",
        recommendedPath: "/create",
      },
      {
        id: "group-night-chill",
        label: "Chill group night",
        prompt: "chill group dinner and relaxed activity",
        recommendedPath: "/create",
      },
      {
        id: "group-night-photo-friendly",
        label: "Photo-friendly group night",
        prompt: "cute photo friendly dinner spot and drinks for a group",
        recommendedPath: "/create",
      },
    ],
  },
];

export const betaSuggestedPrompts = betaSuggestedPromptCategories.flatMap(
  (category) =>
    category.prompts.map((prompt) => ({
      ...prompt,
      categoryId: category.id,
      categoryLabel: category.label,
    })),
);
