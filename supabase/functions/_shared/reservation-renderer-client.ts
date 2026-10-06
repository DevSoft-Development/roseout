const encoder = new TextEncoder();

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return hex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, value: string) {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", imported, encoder.encode(value));
  return new Uint8Array(signature);
}

async function signingKey(secret: string, date: string, region: string, service: string) {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function awsTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:-]|.d{3}/g, "");
}

export type RenderedReservationPage = {
  ok: boolean;
  finalUrl?: string;
  html?: string;
  truncated?: boolean;
  error?: string;
};

export async function renderReservationPage(url: string): Promise<RenderedReservationPage> {
  const functionName = String(Deno.env.get("RESERVATION_RENDERER_FUNCTION_NAME") || "").trim();
  const region = String(Deno.env.get("AWS_REGION") || Deno.env.get("AWS_DEFAULT_REGION") || "us-east-1").trim();
  const accessKeyId = String(Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
  const secretAccessKey = String(Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
  const sessionToken = String(Deno.env.get("AWS_SESSION_TOKEN") || "").trim();

  if (!functionName || !accessKeyId || !secretAccessKey) {
    return { ok: false, error: "renderer_unavailable" };
  }

  const service = "lambda";
  const now = new Date();
  const amzDate = awsTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = `lambda.${region}.amazonaws.com`;
  const canonicalUri = `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`;
  const endpoint = `https://${host}${canonicalUri}`;
  const body = JSON.stringify({ url });
  const payloadHash = await sha256(body);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "host": host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");
  const key = await signingKey(secretAccessKey, dateStamp, region, service);
  const signature = hex(await hmac(key, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers,
        authorization,
      },
      body,
    });

    if (!response.ok) {
      return { ok: false, error: `renderer_invoke_http_${response.status}` };
    }
    if (response.headers.get("x-amz-function-error")) {
      return { ok: false, error: "renderer_function_error" };
    }

    const lambdaResponse = await response.json() as {
      statusCode?: number;
      body?: string | Record<string, unknown>;
    };
    const parsedBody = typeof lambdaResponse.body === "string"
      ? JSON.parse(lambdaResponse.body)
      : (lambdaResponse.body || {});

    if (Number(lambdaResponse.statusCode || 500) >= 400) {
      return { ok: false, error: String((parsedBody as Record<string, unknown>).error || "renderer_rejected") };
    }

    return parsedBody as RenderedReservationPage;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "renderer_invoke_failed",
    };
  }
}
