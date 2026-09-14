import { loadDiscoverSections } from "@/lib/discover";
import { mobileJson } from "@/app/api/mobile/v1/_lib/response";

export async function GET() {
  const sections = await loadDiscoverSections();
  return mobileJson({ ok: true, sections });
}
