export const WEBSITE_AI_MODEL = process.env.WEBSITE_AI_MODEL || "gpt-4o-mini";

export const WEBSITE_AI_INPUT_COST_MICROS_PER_1M = Number(
  process.env.WEBSITE_AI_INPUT_COST_MICROS_PER_1M || 1_000_000,
);

export const WEBSITE_AI_OUTPUT_COST_MICROS_PER_1M = Number(
  process.env.WEBSITE_AI_OUTPUT_COST_MICROS_PER_1M || 4_000_000,
);

export const WEBSITE_AI_ESTIMATED_INPUT_TOKENS = Number(
  process.env.WEBSITE_AI_ESTIMATED_INPUT_TOKENS || 1800,
);

export const WEBSITE_AI_ESTIMATED_OUTPUT_TOKENS = Number(
  process.env.WEBSITE_AI_ESTIMATED_OUTPUT_TOKENS || 500,
);

export const WEBSITE_AI_IMAGE_GENERATION_ENABLED = false as const;

export function estimateWebsiteAiCostMicros(
  inputTokens = WEBSITE_AI_ESTIMATED_INPUT_TOKENS,
  outputTokens = WEBSITE_AI_ESTIMATED_OUTPUT_TOKENS,
) {
  const inputCost = Math.ceil((Math.max(0, inputTokens) / 1_000_000) * WEBSITE_AI_INPUT_COST_MICROS_PER_1M);
  const outputCost = Math.ceil((Math.max(0, outputTokens) / 1_000_000) * WEBSITE_AI_OUTPUT_COST_MICROS_PER_1M);
  return inputCost + outputCost;
}
