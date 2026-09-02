function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assistantConfig() {
  const baseUrl = clean(Deno.env.get("AWS_PLATFORM_ASSISTANT_API_URL")).replace(/\/$/, "");
  const secret = clean(Deno.env.get("AWS_PLATFORM_ASSISTANT_API_SECRET"))
    || clean(Deno.env.get("AWS_PLATFORM_JOB_GATEWAY_SECRET"));
  if (!baseUrl.startsWith("https://")) throw new Error("AWS_PLATFORM_ASSISTANT_API_URL is not configured");
  if (secret.length < 32) throw new Error("AWS Assistant API shared secret is not configured");
  return { baseUrl, secret };
}

export function platformAssistantApiConfigured() {
  try {
    assistantConfig();
    return true;
  } catch {
    return false;
  }
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function openAiViaAssistantApi<T = Record<string, unknown>>(
  endpoint: "chat/completions" | "responses" | "embeddings",
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { baseUrl, secret } = assistantConfig();
  const path = `/v1/openai/${endpoint}`;
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = await hmacHex(secret, `${timestamp}\nPOST\n${path}\n${body}`);
  const controller = options.signal ? null : new AbortController();
  const timer = controller
    ? setTimeout(() => controller.abort(), Math.max(1_000, Number(options.timeoutMs ?? 55_000)))
    : null;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      body,
      signal: options.signal || controller?.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = clean((data as any)?.error?.message) || `AWS Assistant API HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!data) throw new Error("AWS Assistant API returned an empty response");
    return data as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
