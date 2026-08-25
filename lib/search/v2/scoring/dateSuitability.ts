export type DateSuitabilityResult = {
  adjustment: number;
  fit: "strong" | "positive" | "neutral" | "weak" | "poor";
  positiveSignals: string[];
  negativeSignals: string[];
};

const STRONG_SERVICE = /\b(full[- ]service|table service|sit[- ]down|sit down|waitstaff|waiter service|reservations?|reservation available|dine[- ]in seating)\b/i;
const DATE_AMBIANCE = /\b(romantic|intimate|candlelit|date night|date-night|cozy|elegant|upscale|quiet dining|rooftop dining)\b/i;
const EVENING_DINING = /\b(dinner service|evening dining|prix fixe|tasting menu|wine list|wine bar|cocktail program|cocktails|sommelier)\b/i;
const QUICK_SERVICE = /\b(counter service|takeout[- ]first|takeout first|take[- ]out|takeaway|grab[- ]and[- ]go|grab and go|fast food|fast[- ]casual|quick service|food court|drive[- ]through|drive thru|order at the counter|counter[- ]serve)\b/i;
const TAKEOUT_LEANING = /\b(carryout|carry-out|pickup only|pick-up only|delivery only|cafeteria service|to go|to-go)\b/i;
const QUICK_CONCEPT = /\b(starbucks|dunkin|mcdonald'?s|burger king|wendy'?s|taco bell|kfc|popeyes|subway|chipotle|panera|pizza|pizzeria|pizza shop|slice shop|pizza by the slice|deli|delicatessen|bakery|bake shop|bagels?|bagel shop|sandwiches?|sandwich shop|subs?|sub shop|hoagies?|hoagie shop|takeout restaurant|takeaway restaurant|food truck|food cart|kiosk|counter spot|counter-service spot|juice|juice bar|juice shop|smoothies?|smoothie shop|ice cream|ice cream shop|ice-cream shop|gelato|gelato shop|desserts?|dessert shop|donuts?|donut shop|doughnuts?|doughnut shop|coffee|coffee shop|coffeehouse|cafe counter|cafeteria|bodega|market|grocery|convenience store|wings?|wing shop|fried chicken|chicken shop|burgers?|burger joint|hot dogs?|hot dog stand|tacos?|taco stand|shawarma|shawarma stand|falafel|falafel stand|snack bar)\b/i;
const EXPLICIT_QUICK_DATE_CONCEPT_QUERY = /\b(starbucks|dunkin|mcdonald'?s|burger king|wendy'?s|taco bell|kfc|popeyes|subway|chipotle|panera|pizza|pizzeria|coffee|coffee shop|coffeehouse|cafe|café|bakery|bagels?|deli|sandwiches?|dessert|ice cream|gelato|donuts?|doughnuts?|juice|smoothies?|burgers?|wings?|tacos?|shawarma|falafel)\b/i;

export function explicitlyRequestsQuickDateConcept(query: string): boolean {
  return EXPLICIT_QUICK_DATE_CONCEPT_QUERY.test(String(query || ""));
}

export function scoreDateSuitability(text: string): DateSuitabilityResult {
  const normalized = String(text || "").toLowerCase();
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  let adjustment = 0;

  const strongService = STRONG_SERVICE.test(normalized);
  const dateAmbiance = DATE_AMBIANCE.test(normalized);
  const eveningDining = EVENING_DINING.test(normalized);
  const quickService = QUICK_SERVICE.test(normalized);
  const takeoutLeaning = TAKEOUT_LEANING.test(normalized);
  const quickConcept = QUICK_CONCEPT.test(normalized);

  if (strongService) {
    adjustment += 16;
    positiveSignals.push("sit-down/full-service evidence");
  }
  if (dateAmbiance) {
    adjustment += 11;
    positiveSignals.push("date-night ambiance evidence");
  }
  if (eveningDining) {
    adjustment += 7;
    positiveSignals.push("evening dining evidence");
  }

  if (quickService) {
    adjustment -= strongService ? 10 : 32;
    negativeSignals.push("takeout/counter/quick-service evidence");
  }
  if (takeoutLeaning && !strongService) {
    adjustment -= 12;
    negativeSignals.push("takeout-leaning service evidence");
  }
  if (quickConcept && !strongService && !dateAmbiance && !eveningDining) {
    adjustment -= 18;
    negativeSignals.push("quick-service concept evidence without sit-down date evidence");
  }

  adjustment = Math.max(-36, Math.min(26, adjustment));
  const fit = adjustment >= 18
    ? "strong"
    : adjustment >= 7
      ? "positive"
      : adjustment <= -20
        ? "poor"
        : adjustment <= -7
          ? "weak"
          : "neutral";

  return { adjustment, fit, positiveSignals, negativeSignals };
}

export function passesDateNightRestaurantQualityFloor(text: string): boolean {
  const fit = scoreDateSuitability(text).fit;
  return fit !== "weak" && fit !== "poor";
}
