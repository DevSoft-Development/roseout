import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminDesignSystem";
import SearchBenchmarkClient from "./SearchBenchmarkClient";
import SearchRankingRolloutClient from "./SearchRankingRolloutClient";

export const metadata = { title: "Search Benchmark – Admin" };
export const dynamic = "force-dynamic";

export default async function SearchBenchmarkPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin Tools / Search"
        title="Golden Search Benchmark"
        subtitle="Label search results, compare control and shadow ranking, and block rollout when quality regresses."
      />
      <div className="space-y-6">
        <SearchRankingRolloutClient />
        <SearchBenchmarkClient />
      </div>
    </AdminPageShell>
  );
}