import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";

const API_BASE = "https://api.dataforseo.com";

type DataForSeoEnvelope<T = unknown> = {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    result?: T[];
  }>;
};

async function credentials() {
  const values = await getCredentialVaultProviderValues("dataforseo");
  const login = String(values.login || "").trim();
  const password = String(values.password || "").trim();
  if (!login || !password) throw new Error("dataforseo_credentials_missing");
  return { login, password };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { login, password } = await credentials();
  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null) as DataForSeoEnvelope<T> | null;
    if (!response.ok) throw new Error(`dataforseo_http_${response.status}`);
    if (!payload || Number(payload.status_code || 0) >= 40000) {
      throw new Error(`dataforseo_api_${payload?.status_code || "invalid"}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchDataForSeoBusinessListings(input: {
  categories?: string[];
  title?: string;
  description?: string;
  locationCoordinate?: string;
  limit?: number;
  orderBy?: string[];
  filters?: unknown[];
}) {
  const task: Record<string, unknown> = {
    ...(input.categories?.length ? { categories: input.categories } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.locationCoordinate ? { location_coordinate: input.locationCoordinate } : {}),
    limit: Math.max(1, Math.min(1000, Math.trunc(input.limit || 100))),
    ...(input.orderBy?.length ? { order_by: input.orderBy } : {}),
    ...(input.filters?.length ? { filters: input.filters } : {}),
  };
  return request<Record<string, unknown>>("/v3/business_data/business_listings/search/live", {
    method: "POST",
    body: JSON.stringify([task]),
  });
}

export async function createDataForSeoReviewTask(input: {
  googlePlaceId?: string;
  keyword?: string;
  locationName: string;
  depth?: number;
  sortBy?: "most_relevant" | "newest" | "highest_rating" | "lowest_rating";
  tag?: string;
}) {
  const googlePlaceId = String(input.googlePlaceId || "").trim();
  const keyword = String(input.keyword || "").trim();
  if (!googlePlaceId && !keyword) throw new Error("dataforseo_review_identity_required");
  const payload = await request<Record<string, unknown>>("/v3/business_data/google/reviews/task_post", {
    method: "POST",
    body: JSON.stringify([{
      ...(googlePlaceId ? { place_id: googlePlaceId } : { keyword }),
      location_name: input.locationName,
      language_name: "English",
      depth: Math.max(10, Math.min(1000, Math.trunc(input.depth || 100))),
      ...(input.sortBy ? { sort_by: input.sortBy } : {}),
      ...(input.tag ? { tag: input.tag } : {}),
    }]),
  });
  const task = payload.tasks?.[0];
  if (!task?.id) throw new Error("dataforseo_review_task_id_missing");
  return { id: task.id, statusCode: task.status_code || null, statusMessage: task.status_message || null };
}

export async function getDataForSeoReviewTask(taskId: string) {
  const id = String(taskId || "").trim();
  if (!/^[0-9a-f-]{30,40}$/i.test(id)) throw new Error("dataforseo_review_task_id_invalid");
  return request<Record<string, unknown>>(`/v3/business_data/google/reviews/task_get/${encodeURIComponent(id)}`);
}

export async function testDataForSeoCredential() {
  return request<Record<string, unknown>>("/v3/appendix/user_data", { method: "GET" });
}
