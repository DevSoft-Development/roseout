import { NextRequest } from "next/server";
import { listKbArticles } from "@/lib/knowledge-base/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  try {
    const result = await listKbArticles("user", null, {
      publicOnly: true,
      q: searchParams.get("q"),
      category: searchParams.get("category"),
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
    });
    let articles = result.articles;
    const audience = searchParams.get("audience");
    if (audience) articles = articles.filter((article) => article.public_audience.includes(audience) || article.public_audience.length === 0);
    return Response.json({ success: true, articles, count: result.count, page: result.page, pageSize: result.pageSize });
  } catch (err) {
    return Response.json({ success: false, error: err instanceof Error ? err.message : "Unable to search" }, { status: 500 });
  }
}
