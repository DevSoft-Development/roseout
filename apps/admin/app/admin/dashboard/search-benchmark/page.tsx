import { requireAdminRole } from "@theouthaven/auth/admin-session";
import SearchBenchmarkClient from "./SearchBenchmarkClient";
import SearchRankingRolloutClient from "./SearchRankingRolloutClient";
import SearchRankingShadowValidationClient from "./SearchRankingShadowValidationClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const metadata = { title: "Search Benchmark – Admin" };
export const dynamic = "force-dynamic";

export default async function SearchBenchmarkPage() {
  await requireAdminRole(["superadmin", "admin", "experience_team"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Intelligence"
        title="Golden Search Benchmark"
        subtitle="Label search results, compare control and shadow ranking, and block rollout when measured quality regresses."
        badge={<AdminStatusBadge tone="green">Benchmark controls active</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton>}
      />

      <AdminSectionCard className="p-5">
        <SearchRankingRolloutClient />
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <SearchRankingShadowValidationClient />
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <SearchBenchmarkClient />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
