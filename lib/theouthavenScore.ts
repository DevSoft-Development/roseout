export function calculateRestaurantScore(
  restaurant: any,
  input: string,
  userLocation?: { latitude: number; longitude: number } | null
) {
  let ruleScore = 0;

  const text = input.toLowerCase();

  if (restaurant.city && text.includes(restaurant.city.toLowerCase())) ruleScore += 25;
  if (restaurant.neighborhood && text.includes(restaurant.neighborhood.toLowerCase())) ruleScore += 25;
  if (restaurant.cuisine_type && text.includes(restaurant.cuisine_type.toLowerCase())) ruleScore += 15;
  if (restaurant.atmosphere && text.includes(restaurant.atmosphere.toLowerCase())) ruleScore += 15;
  if (restaurant.noise_level && text.includes(restaurant.noise_level.toLowerCase())) ruleScore += 10;
  if (restaurant.price_range && text.includes(restaurant.price_range.toLowerCase())) ruleScore += 10;

  if (
    restaurant.primary_tag &&
    text.includes("romantic") &&
    restaurant.primary_tag.toLowerCase().includes("romantic")
  ) {
    ruleScore += 25;
  }

  const qualityScore = restaurant.quality_score || 0;
  const popularityScore = restaurant.popularity_score || 0;

  const finalScore =
    ruleScore * 0.65 +
    qualityScore * 0.2 +
    popularityScore * 0.1;

  return Math.round(Math.min(finalScore, 100));
}