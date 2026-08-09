import Link from "next/link";
import type { BusinessOrganizationSummary } from "@/lib/organizations/context";

export default function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: BusinessOrganizationSummary[];
  currentOrganizationId: string | null;
}) {
  if (!organizations.length) return null;

  return (
    <div className="border-b border-white/10 bg-[#080808] px-4 py-3 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[0.16em] text-white/45">
          Organization
        </span>
        {organizations.map((organization) => {
          const active = organization.id === currentOrganizationId;
          return (
            <Link
              key={organization.id}
              href={`/business/dashboard?organizationId=${encodeURIComponent(organization.id)}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? "border-[#ec0b5b]/40 bg-[#ec0b5b]/15 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
              }`}
            >
              {organization.name}
              {organization.locationCount ? ` · ${organization.locationCount} location${organization.locationCount === 1 ? "" : "s"}` : ""}
            </Link>
          );
        })}
        <Link
          href="/business/onboarding"
          className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/55 hover:text-white"
        >
          + New organization
        </Link>
      </div>
    </div>
  );
}
