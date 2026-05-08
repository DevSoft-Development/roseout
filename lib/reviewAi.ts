// lib/reviewAi.ts

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ReviewAnalysis = {
  keywords: string[];
  sentiment: "positive" | "neutral" | "negative";
  vibe:
    | "romantic"
    | "fun"
    | "chill"
    | "upscale"
    | "casual"
    | "trendy"
    | "cozy"
    | "lively"
    | "intimate"
    | "classy"
    | "energetic";
  noise_level: "quiet" | "moderate" | "loud" | "very loud";
  date_night: boolean;
  group_friendly: boolean;
  family_friendly: boolean;
  occasion_fit: string[];
  service_quality: "excellent" | "good" | "average" | "bad" | "mixed";
  food_quality: "excellent" | "good" | "average" | "bad" | "mixed";
  ambiance_quality: "excellent" | "good" | "average" | "bad" | "mixed";
  price_feeling: "worth it" | "overpriced" | "affordable" | "fair" | "expensive";
  wait_time: "short" | "normal" | "long" | "unknown";
  reservation_recommended: boolean;
  best_for: string[];
  avoid_if: string[];
  score_boost: number;
};

const fallbackAnalysis: ReviewAnalysis = {
  keywords: [],
  sentiment: "neutral",
  vibe: "casual",
  noise_level: "moderate",
  date_night: false,
  group_friendly: false,
  family_friendly: false,
  occasion_fit: [],
  service_quality: "mixed",
  food_quality: "mixed",
  ambiance_quality: "mixed",
  price_feeling: "fair",
  wait_time: "unknown",
  reservation_recommended: false,
  best_for: [],
  avoid_if: [],
  score_boost: 0,
};

function cleanJson(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function clampScore(value: unknown) {
  const number = Number(value || 0);
  return Math.max(-10, Math.min(10, number));
}

function safeArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export async function analyzeReview(
  reviewText: string
): Promise<ReviewAnalysis> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      return fallbackAnalysis;
    }

    const prompt = `
You are TheOutHaven's review intelligence engine.

TheOutHaven is an AI date night and outing planner. Your job is to understand the customer's real experience and turn it into structured scoring data.

Return valid JSON only. No markdown. No explanation.

Use this exact JSON structure:

{
  "keywords": ["romantic", "loud", "fun"],
  "sentiment": "positive",
  "vibe": "romantic",
  "noise_level": "moderate",
  "date_night": true,
  "group_friendly": true,
  "family_friendly": false,
  "occasion_fit": ["first date", "anniversary"],
  "service_quality": "good",
  "food_quality": "good",
  "ambiance_quality": "excellent",
  "price_feeling": "worth it",
  "wait_time": "normal",
  "reservation_recommended": true,
  "best_for": ["romantic dinner", "upscale date"],
  "avoid_if": ["you want a quiet place"],
  "score_boost": 6
}

Allowed values:
- sentiment: positive, neutral, negative
- vibe: romantic, fun, chill, upscale, casual, trendy, cozy, lively, intimate, classy, energetic
- noise_level: quiet, moderate, loud, very loud
- service_quality: excellent, good, average, bad, mixed
- food_quality: excellent, good, average, bad, mixed
- ambiance_quality: excellent, good, average, bad, mixed
- price_feeling: worth it, overpriced, affordable, fair, expensive
- wait_time: short, normal, long, unknown

Rules:
- keywords must include 5 to 15 useful short phrases.
- occasion_fit should include real use cases like first date, anniversary, birthday, girls night, double date, casual dinner, family outing, special occasion, brunch, drinks, late night, group outing.
- best_for should explain who this place is best for.
- avoid_if should explain who may not enjoy it.
- score_boost must be from -10 to 10.
- Positive reviews should usually score 3 to 10.
- Mixed reviews should usually score -3 to 3.
- Negative reviews should usually score -10 to -2.
- Great food, great ambiance, romantic setting, fun energy, clean space, strong service, or good value should increase the score.
- Rude service, dirty space, bad food, long wait, overpriced experience, disappointing visit, or too loud should lower the score.
- If something is not clearly mentioned, use a safe default.
- Do not make every review positive.

Customer review:
"${reviewText}"
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are TheOutHaven's review intelligence engine. Return ONLY valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(cleanJson(text));

    return {
      keywords: safeArray(parsed.keywords, 15),
      sentiment: parsed.sentiment || fallbackAnalysis.sentiment,
      vibe: parsed.vibe || fallbackAnalysis.vibe,
      noise_level: parsed.noise_level || fallbackAnalysis.noise_level,
      date_night: Boolean(parsed.date_night),
      group_friendly: Boolean(parsed.group_friendly),
      family_friendly: Boolean(parsed.family_friendly),
      occasion_fit: safeArray(parsed.occasion_fit, 10),
      service_quality:
        parsed.service_quality || fallbackAnalysis.service_quality,
      food_quality: parsed.food_quality || fallbackAnalysis.food_quality,
      ambiance_quality:
        parsed.ambiance_quality || fallbackAnalysis.ambiance_quality,
      price_feeling: parsed.price_feeling || fallbackAnalysis.price_feeling,
      wait_time: parsed.wait_time || fallbackAnalysis.wait_time,
      reservation_recommended: Boolean(parsed.reservation_recommended),
      best_for: safeArray(parsed.best_for, 10),
      avoid_if: safeArray(parsed.avoid_if, 10),
      score_boost: clampScore(parsed.score_boost),
    };
  } catch (error) {
    console.error("Review AI failed:", error);
    return fallbackAnalysis;
  }
}