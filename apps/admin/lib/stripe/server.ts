import "server-only";

import { stripeRequestViaIntegrationApi } from "@/lib/aws/integration-api";

export function stripeRequest<T>(
  path: string,
  {
    method = "POST",
    body,
    idempotencyKey,
    stripeAccount,
  }: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
    stripeAccount?: string;
  } = {},
): Promise<T> {
  return stripeRequestViaIntegrationApi<T>({
    apiVersion: "v1",
    method,
    path,
    form: body?.toString(),
    idempotencyKey,
    stripeAccount,
  });
}
