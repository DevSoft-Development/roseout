import { runTheOutHavenSearch } from "@/lib/search/searchPipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.input === "string"
        ? body.input
        : typeof body?.query === "string"
          ? body.query
          : "";

  const result = await runTheOutHavenSearch(query, body);
  return Response.json(result);
}
