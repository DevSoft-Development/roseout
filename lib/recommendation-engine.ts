export type UserOutingSignal = {
  searchHistory?: string[];
  clicks?: string[];
  favorites?: string[];
  reservations?: string[];
  reviews?: Array<{ placeId: string; rating: number; text?: string }>;
  outingPreferences?: string[];
  budgetRange?: "$" | "$$" | "$$$" | "$$$$";
  preferredAreas?: string[];
  nightlifeFrequency?: "low" | "medium" | "high";
  activeDays?: number[];
  activeHours?: number[];
};

export type VenueCandidate = {
  id: string;
  name: string;
  area: string;
  category: string;
  tags: string[];
  budget: "$" | "$$" | "$$$" | "$$$$";
  trendingScore?: number;
  hiddenGemScore?: number;
  nightlifeScore?: number;
  groupFriendly?: boolean;
  dateNightScore?: number;
  lat?: number;
  lng?: number;
};

export type PersonalizedSections = {
  recommendedForYou: VenueCandidate[];
  trendingNearYou: VenueCandidate[];
  similarPlaces: VenueCandidate[];
  becauseYouLiked: VenueCandidate[];
  dateNight: VenueCandidate[];
  groupOuting: VenueCandidate[];
  rooftopNightlife: VenueCandidate[];
  hiddenGems: VenueCandidate[];
  outingCombinations: Array<{ title: string; stops: VenueCandidate[]; estimatedBudget: string }>;
};

const TOP_N = 6;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function scoreCandidate(candidate: VenueCandidate, signal: UserOutingSignal): number {
  const searchTerms = (signal.searchHistory ?? []).map(normalize);
  const prefs = new Set((signal.outingPreferences ?? []).map(normalize));
  const areas = new Set((signal.preferredAreas ?? []).map(normalize));
  const clicks = new Set(signal.clicks ?? []);
  const favorites = new Set(signal.favorites ?? []);
  const booked = new Set(signal.reservations ?? []);

  let score = 0;
  if (searchTerms.some((term) => candidate.name.toLowerCase().includes(term) || candidate.tags.some((tag) => tag.toLowerCase().includes(term)))) score += 4;
  if (prefs.has(candidate.category.toLowerCase()) || candidate.tags.some((tag) => prefs.has(tag.toLowerCase()))) score += 6;
  if (areas.has(candidate.area.toLowerCase())) score += 5;
  if (signal.budgetRange && signal.budgetRange === candidate.budget) score += 4;
  if (clicks.has(candidate.id)) score += 3;
  if (favorites.has(candidate.id)) score += 8;
  if (booked.has(candidate.id)) score += 7;
  score += candidate.trendingScore ?? 0;

  if ((signal.nightlifeFrequency ?? "low") === "high") score += (candidate.nightlifeScore ?? 0) * 1.5;
  return score;
}

function topCandidates(candidates: VenueCandidate[], scoreFn: (c: VenueCandidate) => number, count = TOP_N) {
  return [...candidates].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, count);
}

function estimateBudget(stops: VenueCandidate[]): string {
  const budgetValue = { "$": 1, "$$": 2, "$$$": 3, "$$$$": 4 };
  const avg = stops.reduce((sum, stop) => sum + budgetValue[stop.budget], 0) / Math.max(stops.length, 1);
  if (avg <= 1.4) return "$40-$80";
  if (avg <= 2.4) return "$90-$170";
  if (avg <= 3.4) return "$180-$320";
  return "$350+";
}

export function buildPersonalizedRecommendations(signal: UserOutingSignal, candidates: VenueCandidate[]): PersonalizedSections {
  const scored = topCandidates(candidates, (candidate) => scoreCandidate(candidate, signal), 20);
  const favoritesSet = new Set(signal.favorites ?? []);
  const likedCategories = new Set(
    candidates.filter((candidate) => favoritesSet.has(candidate.id)).map((candidate) => candidate.category.toLowerCase()),
  );

  const similarPlacesPool = candidates.filter((candidate) => likedCategories.has(candidate.category.toLowerCase()));
  const dateNightPool = candidates.filter((candidate) => (candidate.dateNightScore ?? 0) >= 6);
  const groupPool = candidates.filter((candidate) => candidate.groupFriendly);
  const rooftopPool = candidates.filter((candidate) => candidate.tags.some((tag) => ["rooftop", "nightlife", "lounge"].includes(tag.toLowerCase())));

  const outingCombinations = [
    [scored[0], scored[1]].filter(Boolean),
    [topCandidates(dateNightPool, (c) => (c.dateNightScore ?? 0), 1)[0], topCandidates(roofTopFallback(scored), (c) => c.nightlifeScore ?? 0, 1)[0]].filter(Boolean),
  ]
    .filter((stops): stops is VenueCandidate[] => stops.length >= 2)
    .map((stops, idx) => ({
      title: idx === 0 ? "AI-curated classic night" : "Rooftop + romantic pairing",
      stops,
      estimatedBudget: estimateBudget(stops),
    }));

  return {
    recommendedForYou: scored.slice(0, TOP_N),
    trendingNearYou: topCandidates(candidates, (candidate) => candidate.trendingScore ?? 0),
    similarPlaces: topCandidates(similarPlacesPool.length ? similarPlacesPool : candidates, (candidate) => scoreCandidate(candidate, signal)),
    becauseYouLiked: topCandidates(candidates.filter((candidate) => candidate.tags.some((tag) => likedCategories.has(tag.toLowerCase()))), (candidate) => scoreCandidate(candidate, signal)),
    dateNight: topCandidates(dateNightPool.length ? dateNightPool : candidates, (candidate) => (candidate.dateNightScore ?? 0) + scoreCandidate(candidate, signal)),
    groupOuting: topCandidates(groupPool.length ? groupPool : candidates, (candidate) => scoreCandidate(candidate, signal)),
    rooftopNightlife: topCandidates(rooftopPool.length ? rooftopPool : candidates, (candidate) => (candidate.nightlifeScore ?? 0) + scoreCandidate(candidate, signal)),
    hiddenGems: topCandidates(candidates, (candidate) => (candidate.hiddenGemScore ?? 0) + scoreCandidate(candidate, signal) * 0.5),
    outingCombinations,
  };
}

function roofTopFallback(scored: VenueCandidate[]) {
  return scored.filter((candidate) => (candidate.nightlifeScore ?? 0) >= 4);
}
