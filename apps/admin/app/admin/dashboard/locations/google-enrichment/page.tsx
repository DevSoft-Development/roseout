import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GoogleEnrichmentRedirectPage() {
  redirect("/admin/dashboard/settings/location-tools/enrichment");
}
