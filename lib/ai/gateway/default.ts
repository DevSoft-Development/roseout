import { TheOutHavenAiGateway } from "./gateway";
import { createAzureFoundryProvider } from "./providers/azure-foundry";
import { createHuggingFaceAiProvider } from "./providers/huggingface";
import { createAiTierRoutingConfig, TieredAiGateway } from "./routing";

export function createDefaultAiGateway(env: NodeJS.ProcessEnv = process.env) {
  const huggingFaceConfigured = Boolean(
    String(env.HUGGINGFACE_AI_TOKEN || "").trim()
      && String(env.HUGGINGFACE_AI_MODEL || "").trim(),
  );
  const gateway = new TheOutHavenAiGateway(
    createAzureFoundryProvider(env),
    huggingFaceConfigured ? createHuggingFaceAiProvider(env) : undefined,
  );

  return new TieredAiGateway(gateway, createAiTierRoutingConfig(env));
}
