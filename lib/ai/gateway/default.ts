import { TheOutHavenAiGateway } from "./gateway";
import { createAzureFoundryProvider } from "./providers/azure-foundry";
import { createHuggingFaceAiProvider } from "./providers/huggingface";

export function createDefaultAiGateway(env: NodeJS.ProcessEnv = process.env) {
  return new TheOutHavenAiGateway(
    createAzureFoundryProvider(env),
    createHuggingFaceAiProvider(env),
  );
}
