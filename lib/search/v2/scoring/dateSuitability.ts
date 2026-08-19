export type DateSuitabilityResult = {
  adjustment: number;
  fit: "strong" | "positive" | "neutral" | "weak" | "poor";
  positiveSignals: string[];
  negativeSignals: string[];
};

const STRONG_SERVICE = /\b(full[- ]service|table service|sit[- ]down|sit down|waitstaff|waiter service|reservations?|reservation available|dine[- ]in seating)\b/i;
const DATE_AMBIANCE = /\b(romantic|intimate|candlelit|date night|date-night|cozy|elegant|upscale|quiet dining|rooftop dining)\b/i;
const EVENING_DINING = /\b(dinner service|evening dining|prix fixe|tasting menu|wine list|wine bar|cocktail program|cocktails|sommelier)\b/i;
const QUICK_SERVICE = /\b(counter service|takeout[- ]first|takeout first|take[- ]out|takeaway|grab[- ]and[- ]go|grab and go|fast food|fast[- ]casual|quick service|food court|drive[- ]through|drive thru)\b/i;
const TAKEOUT_LEANING = /\b(carryout|carry-out|pickup only|pick-up only|delivery only|cafeteria service)\b/i;

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

  if (strongService) {
    adjustment += 14;
    positiveSignals.push("sit-down/full-service evidence");
  }
  if (dateAmbiance) {
    adjustment += 10;
    positiveSignals.push("date-night ambiance evidence");
  }
  if (eveningDining) {
    adjustment += 6;
    positiveSignals.push("evening dining evidence");
  }

  if (quickService) {
    adjustment -= strongService ? 10 : 26;
    negativeSignals.push("takeout/counter/quick-service evidence");
  }
  if (takeoutLeaning && !strongService) {
    adjustment -= 10;
    negativeSignals.push("takeout-leaning service evidence");
  }

  adjustment = Math.max(-30, Math.min(24, adjustment));
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
