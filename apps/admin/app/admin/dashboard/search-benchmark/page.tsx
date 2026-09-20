import "./search-benchmark.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import SearchBenchmarkClient from "./SearchBenchmarkClient";
import SearchRankingRolloutClient from "./SearchRankingRolloutClient";
import SearchRankingShadowValidationClient from "./SearchRankingShadowValidationClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

export const metadata = { title: "Search Benchmark – Admin" };
export const dynamic = "force-dynamic";

export default async function SearchBenchmarkPage() {
  await requireAdminRole(["superadmin", "admin", "experience_team"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search · Quality Assurance"
        title="Golden Search Benchmark"
        subtitle="Label search results, compare control and shadow ranking, and block rollout when quality regresses."
        badge={<AdminStatusBadge tone="blue">Search quality controls</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton>}
      />
      <section className="search-benchmark-page">
        <div className="search-benchmark-stack">
        <SearchRankingRolloutClient />
        <SearchRankingShadowValidationClient />
        <SearchBenchmarkClient />
        </div>
      </section>
    </AdminPageShell>
  );
}
