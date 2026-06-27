import { POST as previewPost } from "../../email/templates/preview/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return previewPost(request);
}
