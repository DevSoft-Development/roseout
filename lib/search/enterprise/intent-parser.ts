import OpenAI from "openai";
import type { SearchIntent } from "./types";
import { deterministicIntentFromQuery, normalizeIntent } from "./normalize-intent";

const model = process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini";
function extractJson(text: string) { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : JSON.parse(text); }
export async function parseEnterpriseIntent(query: string, options?: { useLLM?: boolean; body?: any }): Promise<{ intent: SearchIntent; llmIntentRaw: unknown; llmError?: string }> {
  if (options?.useLLM === false || !process.env.OPENAI_API_KEY) return { intent: normalizeIntent(query, null), llmIntentRaw: null };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await openai.chat.completions.create({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: `Return JSON only. Classify TheOutHaven local search intent. Separate restaurant and activity lanes; never put activity terms in restaurant intent or food terms in activity intent. Recognize examples: steak dinner with bowling in Astoria => mixed_outing restaurant steak dinner activity bowling geo Astoria Queens; sushi then karaoke in Manhattan => mixed; things to do in Queens => activity; rooftop dinner in Long Island City => restaurant geo Long Island City Queens; rooftop dinner with bowling in LIC => mixed geo Long Island City Queens; Italian restaurant in Nassau => restaurant geo Nassau County Long Island; date night in Hoboken => mixed or any geo Hoboken NJ. Fields: searchType, primaryDomain, needsRestaurant, needsActivity, wantsPairing, restaurantIntent {mealTerms,foodTerms,cuisineTerms,categoryTerms,vibeTerms,featureTerms,negativeTerms}, activityIntent {activityTerms,categoryTerms,vibeTerms,featureTerms,negativeTerms}, geo {raw,neighborhood,city,borough,county,region,state}, occasion, vibe, budget, timeContext.` }, { role: "user", content: query }] });
    const rawText = completion.choices[0]?.message?.content ?? "{}";
    const parsed = extractJson(rawText);
    return { intent: normalizeIntent(query, parsed), llmIntentRaw: parsed };
  } catch (error) {
    return { intent: deterministicIntentFromQuery(query), llmIntentRaw: null, llmError: error instanceof Error ? error.message : String(error) };
  }
}
