import OpenAI from "openai";
import type { SearchIntent } from "./types";
import { deterministicIntentFromQuery, normalizeIntent } from "./normalize-intent";

const model = process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini";
function extractJson(text: string) { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : JSON.parse(text); }
export async function parseEnterpriseIntent(query: string, options?: { useLLM?: boolean; body?: any }): Promise<{ intent: SearchIntent; llmIntentRaw: unknown; llmError?: string }> {
  if (options?.useLLM === false || !process.env.OPENAI_API_KEY) return { intent: normalizeIntent(query, null), llmIntentRaw: null };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await openai.chat.completions.create({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `Return JSON only. Classify TheOutHaven local search intent. Separate restaurant and activity lanes; never put activity terms in restaurant intent or food terms in activity intent.

If the user asks for a restaurant and activity close together, walking distance, nearby, same block, around the corner, or no driving, identify this as a pair-level distance constraint. Do not treat “walking distance” as an activity term.

Pairing preference schema:
pairingPreference { requiresPairing:boolean, distanceMode:"walking"|"nearby"|"same_area"|"any", maxPairDistanceMiles:number|null, maxPairWalkingMinutes:number|null, requireWalkablePair:boolean }
Walking language (walking distance, walkable, walking, short walk, quick walk, within walking distance, can walk to, no driving, without driving, same block, around the corner) => distanceMode walking, requireWalkablePair true, maxPairDistanceMiles 0.75, maxPairWalkingMinutes 15.
Nearby language (nearby, close by, close together, near each other) => distanceMode nearby, requireWalkablePair true, maxPairDistanceMiles 1.5, maxPairWalkingMinutes 30.
Same-area language (same neighborhood, same area, in the area) => distanceMode same_area, requireWalkablePair false, maxPairDistanceMiles 3, maxPairWalkingMinutes null.
Mixed restaurant + activity searches without distance language => distanceMode any, requireWalkablePair false, maxPairDistanceMiles null.

Recognize examples: steak dinner with bowling in Astoria => mixed_outing restaurant steak dinner activity bowling geo Astoria Queens; sushi then karaoke in Manhattan => mixed; things to do in Queens => activity; rooftop dinner in Long Island City => restaurant geo Long Island City Queens; rooftop dinner with bowling in LIC => mixed geo Long Island City Queens; Italian restaurant in Nassau => restaurant geo Nassau County Long Island; date night in Hoboken => mixed or any geo Hoboken NJ.

Example query: “steak dinner with bowling walking distance in Astoria”
Return shape includes: { "searchType":"mixed_outing", "needsRestaurant":true, "needsActivity":true, "wantsPairing":true, "restaurantIntent":{"foodTerms":["steak"],"mealTerms":["dinner"]}, "activityIntent":{"activityTerms":["bowling"]}, "geo":{"neighborhood":"Astoria","borough":"Queens","city":"New York","state":"NY"}, "pairingPreference":{"requiresPairing":true,"distanceMode":"walking","maxPairDistanceMiles":0.75,"maxPairWalkingMinutes":15,"requireWalkablePair":true} }

Fields: searchType, primaryDomain, needsRestaurant, needsActivity, wantsPairing, pairingPreference, restaurantIntent {mealTerms,foodTerms,cuisineTerms,categoryTerms,vibeTerms,featureTerms,negativeTerms}, activityIntent {activityTerms,categoryTerms,vibeTerms,featureTerms,negativeTerms}, geo {raw,neighborhood,city,borough,county,region,state}, occasion, vibe, budget, timeContext.` }, { role: "user", content: query }] });
    const rawText = completion.choices[0]?.message?.content ?? "{}";
    const parsed = extractJson(rawText);
    return { intent: normalizeIntent(query, parsed), llmIntentRaw: parsed };
  } catch (error) {
    return { intent: deterministicIntentFromQuery(query), llmIntentRaw: null, llmError: error instanceof Error ? error.message : String(error) };
  }
}
