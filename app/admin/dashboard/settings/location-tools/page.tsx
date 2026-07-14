import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Tool = {
  title: string;
  description: string;
  badge: string;
  href: string;
};

type ToolSection = {
  title: string;
  description: string;
  eyebrow: string;
  tools: Tool[];
};

const sections: ToolSection[] = [
  {
    title: "Search",
    eyebrow: "Discovery operations",
    description:
      "Improve classification, matching, deduplication, and the data used by public search.",
    tools: [
      {
        title: "Enrichment",
        description:
          "Review Google enrichment and apply high-value category corrections.",
        badge: "Review",
        href: "/admin/dashboard/settings/location-tools/enrichment",
      },
      {
        title: "Duplicates",
        description:
          "Run bounded duplicate scans and review staged match decisions.",
        badge: "Review",
        href: "/admin/dashboard/settings/location-tools/duplicates",
      },
    ],
  },
  {
    title: "Data Quality",
    eyebrow: "Record health",
    description:
      "Find and repair incomplete records, media gaps, and maintenance issues.",
    tools: [
      {
        title: "Data Quality",
        description:
          "Find missing addresses, coordinates, photos, categories, and search metadata.",
        badge: "Repair",
        href: "/admin/dashboard/settings/location-tools/data-quality",
      },
      {
        title: "Photos",
        description:
          "Run photo diagnostics, cache Google photos, and repair individual locations.",
        badge: "Repair",
        href: "/admin/dashboard/settings/location-tools/photos",
      },
      {
        title: "Logs",
        description:
          "Review import and maintenance activity across location operations.",
        badge: "Logs",
        href: "/admin/dashboard/settings/location-tools/logs",
      },
    ],
  },
  {
    title: "Publishing",
    eyebrow: "Release controls",
    description:
      "Control market assignment, publish readiness, and searchable status.",
    tools: [
      {
        title: "Publishing",
        description:
          "Review publish readiness and safely repair searchable status.",
        badge: "Publish",
        href: "/admin/dashboard/settings/location-tools/publishing",
      },
      {
        title: "Markets",
        description:
          "Review market assignment counts and run safe bounded repairs.",
        badge: "Repair",
        href: "/admin/dashboard/settings/location-tools/markets",
      },
    ],
  },
  {
    title: "Claims",
    eyebrow: "Ownership access",
    description:
      "Maintain claim codes, canonical URLs, and QR-based ownership workflows.",
    tools: [
      {
        title: "Claim URLs",
        description:
          "Repair claim codes, canonical URLs, and generated QR destinations.",
        badge: "Claims",
        href: "/admin/dashboard/settings/location-tools/claim-urls",
      },
    ],
  },
  {
    title: "Imports",
    eyebrow: "Data acquisition",
    description:
      "Manage source imports and review recent ingestion activity from one place.",
    tools: [
      {
        title: "Import",
        description:
          "Run Google, CSV, NYC, and OSM workflows and review recent import logs.",
        badge: "Imports",
        href: "/admin/dashboard/settings/location-tools/import",
      },
    ],
  },
  {
    title: "Anchors",
    eyebrow: "Proximity search",
    description:
      "Manage the named places and radius policies that power anchored nearby search.",
    tools: [
      {
        title: "Anchor Locations",
        description:
          "Manage landmarks, venues, businesses, aliases, review status, and radius policies.",
        badge: "Search",
        href: "/admin/dashboard/search-anchors",
      },
    ],
  },
];

export default async function LocationToolsPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const toolCount = sections.reduce(
    (count, section) => count + section.tools.length,
    0,
  );

  return (
    <main className="min-h-screen bg-[#080407] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.2),transparent_34%),#0d0d0f] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">
            Admin Settings / Location Operations
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                Location Tools
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60 sm:text-base">
                Enterprise operations hub for search quality, data repair,
                publishing, claims, imports, and anchor-location management.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-white/35">
                  Sections
                </p>
                <p className="mt-1 text-2xl font-black">{sections.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-white/35">
                  Tools
                </p>
                <p className="mt-1 text-2xl font-black">{toolCount}</p>
              </div>
            </div>
          </div>
        </section>

        <nav
          aria-label="Location tool sections"
          className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#111] p-2"
        >
          {sections.map((section) => (
            <a
              key={section.title}
              href={`#${section.title.toLowerCase().replace(/\s+/g, "-")}`}
              className="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest text-white/55 transition hover:bg-white/[0.07] hover:text-white"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="space-y-6">
          {sections.map((section) => {
            const sectionId = section.title.toLowerCase().replace(/\s+/g, "-");

            return (
              <section
                key={section.title}
                id={sectionId}
                className="scroll-mt-6 rounded-[2rem] border border-white/10 bg-[#0d0d0f] p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
                      {section.eyebrow}
                    </p>
                    <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                      {section.title}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
                      {section.description}
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-widest text-white/50">
                    {section.tools.length} {section.tools.length === 1 ? "tool" : "tools"}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.tools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="group rounded-3xl border border-white/10 bg-[#111] p-5 transition hover:-translate-y-0.5 hover:border-rose-300/30 hover:bg-white/[0.07]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-rose-100">
                          {tool.badge}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-lg font-black text-white/30 transition group-hover:translate-x-1 group-hover:text-rose-200"
                        >
                          →
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-black text-white">
                        {tool.title}
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-6 text-white/55">
                        {tool.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-3xl border border-white/10 bg-[#111] p-5 text-sm font-bold text-white/65">
          <p className="text-xs font-black uppercase tracking-widest text-white/35">
            Related database
          </p>
          <p className="mt-2">
            Browse and edit individual records in the{" "}
            <Link
              className="text-rose-200 underline underline-offset-4"
              href="/admin/dashboard/locations"
            >
              all-location database
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
