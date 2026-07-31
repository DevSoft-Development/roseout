#!/usr/bin/env node

const baseUrl = process.env.SEARCH_BENCHMARK_BASE_URL;
const adminToken = process.env.SEARCH_BENCHMARK_ADMIN_TOKEN;
const limit = Number(process.env.SEARCH_BENCHMARK_LIMIT ?? 1000);

if (!baseUrl || !adminToken) {
  console.error("SEARCH_BENCHMARK_BASE_URL and SEARCH_BENCHMARK_ADMIN_TOKEN are required.");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/admin/search-quality/benchmark`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    limit,
    environment: process.env.VERCEL_ENV ?? "production",
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  }),
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
const metrics = body.metrics ?? {};
if (Number(metrics.engineCorrectnessRate ?? 0) < 98) process.exit(2);
if (metrics.knownInventoryRecallRate != null && Number(metrics.knownInventoryRecallRate) < 98) process.exit(2);
