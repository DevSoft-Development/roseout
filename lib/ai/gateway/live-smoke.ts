import { createDefaultAiGateway } from "./default";

const EXPECTED_TOKEN = "THEOUTHAVEN_AZURE_GATEWAY_SMOKE_OK";

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  required("AZURE_AI_ENDPOINT");
  required("AZURE_AI_API_KEY");
  const expectedModel = required("AZURE_AI_MODEL");

  const gateway = createDefaultAiGateway(process.env);
  const response = await gateway.invoke<{ messages: { role: string; content: string }[] }, string>({
    capability: "generate",
    input: {
      messages: [
        {
          role: "system",
          content: `Return exactly ${EXPECTED_TOKEN} and nothing else.`,
        },
        { role: "user", content: "TheOutHaven Azure gateway health check" },
      ],
    },
    tier: "standard",
    timeoutMs: 60_000,
  });

  if (response.provider !== "azure") {
    throw new Error(
      `Live gateway smoke unexpectedly used provider ${response.provider}; Azure primary was required.`,
    );
  }

  if (response.failoverUsed) {
    throw new Error("Live gateway smoke used failover; Azure primary must pass directly.");
  }

  if (response.model !== expectedModel) {
    throw new Error(
      `Live gateway smoke used model ${response.model ?? "unknown"}; expected ${expectedModel}.`,
    );
  }

  const output = String(response.output || "").trim();
  if (output !== EXPECTED_TOKEN) {
    throw new Error(
      `Live gateway smoke returned unexpected content: ${JSON.stringify(output)}`,
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      provider: response.provider,
      model: response.model,
      failoverUsed: response.failoverUsed,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
