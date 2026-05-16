import { getLocationTags } from "@/lib/locationFields";
import { getSearchRankingScore } from "@/lib/locationScore";

export function calculateRestaurantScore(
  restaurant: any,
  input: string,
  userLocation?: { latitude: number; longitude: number } | null
) {
  let ruleScore = 0;

  const text = input.toLowerCase();

  if (restaurant.city && text.includes(restaurant.city.toLowerCase())) ruleScore += 25;
  if (restaurant.neighborhood && text.includes(restaurant.neighborhood.toLowerCase())) ruleScore += 25;
  if (getLocationTags(restaurant).some((tag) => text.includes(tag))) ruleScore += 15;
  if (restaurant.atmosphere && text.includes(restaurant.atmosphere.toLowerCase())) ruleScore += 15;
  if (restaurant.noise_level && text.includes(restaurant.noise_level.toLowerCase())) ruleScore += 10;
  if (restaurant.price_range && text.includes(restaurant.price_range.toLowerCase())) ruleScore += 10;

  if (
    text.includes("romantic") &&
    getLocationTags(restaurant).some((tag) => tag.includes("romantic"))
  ) {
    ruleScore += 25;
  }

  const rankingScore = getSearchRankingScore(restaurant);

  const finalScore = ruleScore * 0.65 + rankingScore * 0.3;

  return Math.round(Math.min(finalScore, 100));
}