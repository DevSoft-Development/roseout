import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const secretId = String(process.env.BACKGROUND_RUNTIME_SECRET_ID || "").trim();
const secretRegion = String(process.env.BACKGROUND_RUNTIME_SECRET_REGION || process.env.AWS_REGION || "us-east-1").trim();
if (!secretId) throw new Error("BACKGROUND_RUNTIME_SECRET_ID is required");

const client = new SecretsManagerClient({ region: secretRegion });
const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
const parsed = JSON.parse(response.SecretString || "{}");

for (const [key, value] of Object.entries(parsed)) {
  if (typeof value === "string" && value) process.env[key] = value;
}

process.env.PLATFORM_RUNTIME_PROVIDER = "aws-background";
process.env.HOSTNAME = "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";

await import("./server.js");
