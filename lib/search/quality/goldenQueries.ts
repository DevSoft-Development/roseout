export type GoldenQueryExpectation = {
  expectedDomains: Array<'restaurant' | 'activity'>;
  expectedActivityCategories?: string[];
  expectedRestaurantTerms?: string[];
  expectedGeography?: string[];
  minimumResults?: number;
  minimumPairs?: number;
  maximumDistanceMiles?: number;
  prohibitedCategories?: string[];
};

export type GoldenQueryCase = {
  id: string;
  category: string;
  query: string;
  expectations: GoldenQueryExpectation;
};

const pair = (id: string, category: string, query: string, activity: string, geography: string): GoldenQueryCase => ({
  id,
  category,
  query,
  expectations: {
    expectedDomains: ['restaurant', 'activity'],
    expectedActivityCategories: [activity],
    expectedGeography: [geography],
    minimumResults: 2,
    minimumPairs: 1,
  },
});

export const GOLDEN_SEARCH_QUERIES: GoldenQueryCase[] = [
  pair('pair-astoria-bowling', 'paired', 'Dinner and bowling in Astoria within a 20-minute walk', 'bowling', 'Astoria'),
  pair('pair-manhattan-live-music', 'paired', 'Italian dinner with live music nearby in Manhattan', 'live music', 'Manhattan'),
  pair('pair-brooklyn-comedy', 'paired', 'Seafood dinner with a comedy show after in Brooklyn', 'comedy', 'Brooklyn'),
  pair('pair-williamsburg-gallery', 'paired', 'Brunch and an art gallery in Williamsburg', 'art gallery', 'Williamsburg'),
  pair('pair-flushing-karaoke', 'paired', 'Halal dinner with karaoke nearby in Flushing', 'karaoke', 'Flushing'),
  pair('pair-queens-arcade', 'paired', 'Casual dinner and an arcade in Queens', 'arcade', 'Queens'),
  pair('pair-midtown-rooftop', 'paired', 'Steak dinner and rooftop drinks in Midtown', 'rooftop', 'Midtown'),
  pair('pair-forest-hills-movie', 'paired', 'Dinner and a movie in Forest Hills', 'movie', 'Forest Hills'),
  pair('pair-garden-city-escape', 'paired', 'Sushi and an escape room in Garden City', 'escape room', 'Garden City'),
  pair('pair-long-island-mini-golf', 'paired', 'Dinner and mini golf on Long Island', 'mini golf', 'Long Island'),
  { id: 'restaurant-astoria-chicken', category: 'restaurant', query: 'Chicken lunch in Astoria', expectations: { expectedDomains: ['restaurant'], expectedGeography: ['Astoria'], minimumResults: 1 } },
  { id: 'restaurant-queens-rooftop', category: 'restaurant', query: 'Rooftop dinner in Queens', expectations: { expectedDomains: ['restaurant'], expectedGeography: ['Queens'], minimumResults: 1 } },
  { id: 'restaurant-nyc-wings', category: 'restaurant', query: 'Bar with wings NYC', expectations: { expectedDomains: ['restaurant'], expectedRestaurantTerms: ['wings'], minimumResults: 1 } },
  { id: 'activity-queens-teen', category: 'activity', query: 'Fun activity with my teenage son in Queens', expectations: { expectedDomains: ['activity'], expectedGeography: ['Queens'], minimumResults: 1, prohibitedCategories: ['nightclub'] } },
  { id: 'activity-harlem-sports', category: 'activity', query: 'Best bar to watch the Knicks game in Harlem', expectations: { expectedDomains: ['activity'], expectedGeography: ['Harlem'], minimumResults: 1 } },
  { id: 'anchor-gaming-city', category: 'anchor', query: 'Restaurant near Gaming City in Astoria', expectations: { expectedDomains: ['restaurant'], expectedGeography: ['Astoria'], minimumResults: 1 } },
  { id: 'family-bayside', category: 'family', query: 'Family-friendly dinner and activity in Bayside', expectations: { expectedDomains: ['restaurant', 'activity'], expectedGeography: ['Bayside'], minimumPairs: 1, prohibitedCategories: ['nightclub', 'hookah lounge'] } },
  { id: 'date-night-soho', category: 'occasion', query: 'Romantic date night in Soho with dinner and cocktails', expectations: { expectedDomains: ['restaurant', 'activity'], expectedGeography: ['Soho'], minimumPairs: 1 } },
  { id: 'nightlife-williamsburg', category: 'nightlife', query: 'Girls night dinner with cocktails in Williamsburg', expectations: { expectedDomains: ['restaurant', 'activity'], expectedGeography: ['Williamsburg'], minimumPairs: 1 } },
  { id: 'ambiguous-queens', category: 'ambiguous', query: 'Something fun tonight in Queens', expectations: { expectedDomains: ['activity'], expectedGeography: ['Queens'], minimumResults: 1 } },
];
