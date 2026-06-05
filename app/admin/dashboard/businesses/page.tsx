export const dynamic = "force-dynamic";

import Link from "next/link";
import BusinessViewPage from "./view/page";

const tabs = [
  ["Overview", "/admin/dashboard/businesses"],
  ["View Businesses", "/admin/dashboard/businesses/view"],
  ["Outreach", "/admin/dashboard/businesses/outreach"],
  ["Follow-ups", "/admin/dashboard/businesses/follow-ups"],
  ["Communication Center", "/admin/dashboard/businesses/communication"],
  [
    "Upgrade Opportunities",
    "/admin/dashboard/businesses/upgrade-opportunities",
  ],
  ["Churn Risk", "/admin/dashboard/businesses/churn-risk"],
];

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
}) {
  return (
    <>
      <div className="bg-[#090706] px-4 pt-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1450px] space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
              Owners
            </p>
            <h1 className="mt-2 text-3xl font-black">Businesses</h1>
            <p className="mt-2 text-sm text-white/60">
              Business CRM workflows, outreach, follow-ups, communications,
              upgrade opportunities, and churn risk now live under this main
              page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
      <BusinessViewPage searchParams={searchParams} />
    </>
  );
}
