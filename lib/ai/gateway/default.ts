import { TheOutHavenAiGateway } from "./gateway";
import { createAzureFoundryProvider } from "./providers/azure-foundry";
import { createHuggingFaceAiProvider } from "./providers/huggingface";
import { createAiTierRoutingConfig, TieredAiGateway } from "./routing";

export function createDefaultAiGateway(env: NodeJS.ProcessEnv = process.env) {
  const gateway = new TheOutHavenAiGateway(
    createAzureFoundryProvider(env),
    createHuggingFaceAiProvider(env),
  );

  return new TieredAiGateway(gateway, createAiTierRoutingConfig(env));
}
