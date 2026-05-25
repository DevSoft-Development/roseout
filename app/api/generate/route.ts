import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.input === "string" ? body.input : "";
  const result = await runTheOutHavenSearch(input, body);
  return Response.json(result);
}
