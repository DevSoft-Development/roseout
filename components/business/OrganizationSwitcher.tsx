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
  const currentOrganization = organizations.find((organization) => organization.id === currentOrganizationId) || null;
  const canManageVerification = Boolean(currentOrganization && ["owner", "admin"].includes(currentOrganization.role));

  return (
    <div className="border-b border-[var(--business-border)] bg-[var(--business-panel)] px-4 py-3 text-[var(--business-text)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">
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
                  ? "border-[#ec0b5b]/40 bg-[#ec0b5b]/15 text-[var(--business-text)]"
                  : "border-[var(--business-border)] bg-white/[0.04] text-[var(--business-soft)] hover:text-[var(--business-text)]"
              }`}
            >
              {organization.name}
              {organization.locationCount
                ? ` · ${organization.locationCount} location${organization.locationCount === 1 ? "" : "s"}`
                : ""}
            </Link>
          );
        })}
        {currentOrganizationId && canManageVerification ? (
          <Link
            href={`/business/dashboard/verification?organizationId=${encodeURIComponent(currentOrganizationId)}`}
            className="ml-auto rounded-full border border-[#ec0b5b]/25 bg-[#ec0b5b]/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-[#ec0b5b]/15"
          >
            Verification
          </Link>
        ) : null}
        <Link
          href="/business/onboarding?new=1"
          className={`${currentOrganizationId && canManageVerification ? "" : "ml-auto"} rounded-full border border-[var(--business-border)] px-3 py-1.5 text-xs font-bold text-[var(--business-muted)] hover:text-[var(--business-text)]`}
        >
          + New organization
        </Link>
      </div>
    </div>
  );
}
