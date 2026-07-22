import { handleGeneratePost } from "@/lib/search/public-api/controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleGeneratePost(request);
}
