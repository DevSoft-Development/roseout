import "./data-quality.css";

import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const dynamic = "force-dynamic";

const primaryActions = [
  {
    title: "Review new locations",
    description:
      "Approve strong Google-discovered locations, keep weak candidates hidden, and resolve review blockers.",
    href: "/admin/dashboard/settings/location-tools/google-discovery",
    action: "Open review queue",
  },
  {
    title: "Resolve duplicates",
    description:
      "Review possible duplicates before they can reach public search or consume more enrichment work.",
    href: "/admin/dashboard/settings/location-tools/duplicates",
    action: "Review duplicates",
  },
  {
    title: "Repair incomplete data",
    description:
      "Fill missing photos, websites, hours, categories, and other fields that keep locations from being ready.",
    href: "/admin/dashboard/settings/location-tools/enrichment",
    action: "Open enrichment",
  },
  {
    title: "Review hidden inventory",
    description:
      "See locations currently kept out of public search and decide what can be repaired or should stay hidden.",
    href: "/admin/dashboard/settings/location-tools/hidden-locations",
    action: "Review hidden locations",
  },
] as const;

const advancedTools = [
  ["Publishing rules", "/admin/dashboard/settings/location-tools/publishing"],
  ["Photos", "/admin/dashboard/settings/location-tools/photos"],
  ["Import", "/admin/dashboard/settings/location-tools/import"],
  ["Markets", "/admin/dashboard/settings/location-tools/markets"],
  ["Search profiles", "/admin/dashboard/settings/location-tools/search-profiles"],
  ["Claim URLs", "/admin/dashboard/settings/location-tools/claim-urls"],
  ["Logs", "/admin/dashboard/settings/location-tools/logs"],
] as const;

export default async function DataQualityPage() {
  await requireAdminRole(["superadmin", "admin"]);

  return (
    <section className="data-quality-page">
      <header className="data-quality-hero">
        <p>Location Quality</p>
        <h1>What needs a decision?</h1>
        <span>
          Start with the queues that affect whether a location can safely appear in customer search.
        </span>
      </header>

      <section className="data-quality-actions">
        {primaryActions.map((item) => (
          <article key={item.href}>
            <span className="data-quality-badge">Decision queue</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <Link href={item.href}>{item.action} →</Link>
          </article>
        ))}
      </section>

      <section className="data-quality-standard">
        <p>Quality standard</p>
        <h2>Public search should only see locations that are ready.</h2>
        <span>
          Possible duplicates, hidden inventory, and incomplete records should be resolved before publication.
        </span>
      </section>

      <details className="data-quality-advanced">
        <summary>Advanced location operations <span>+</span></summary>
        <div>
          {advancedTools.map(([label, href]) => (
            <Link key={href} href={href}>{label} →</Link>
          ))}
        </div>
      </details>
    </section>
  );
}
