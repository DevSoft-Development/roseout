import "./search-benchmark.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import SearchBenchmarkClient from "./SearchBenchmarkClient";
import SearchRankingRolloutClient from "./SearchRankingRolloutClient";
import SearchRankingShadowValidationClient from "./SearchRankingShadowValidationClient";

export const metadata = { title: "Search Benchmark – Admin" };
export const dynamic = "force-dynamic";

export default async function SearchBenchmarkPage() {
  await requireAdminRole(["superadmin", "admin", "experience_team"]);

  return (
    <section className="search-benchmark-page">
      <header className="search-benchmark-hero">
        <p>Admin Tools / Search</p>
        <h1>Golden Search Benchmark</h1>
        <span>
          Label search results, compare control and shadow ranking, and block
          rollout when quality regresses.
        </span>
      </header>

      <div className="search-benchmark-stack">
        <SearchRankingRolloutClient />
        <SearchRankingShadowValidationClient />
        <SearchBenchmarkClient />
      </div>
    </section>
  );
}
