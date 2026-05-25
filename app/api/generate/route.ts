import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = String(body?.input || body?.query || "");
  const result = await runTheOutHavenSearch(input, body);
  return Response.json(result);
}
