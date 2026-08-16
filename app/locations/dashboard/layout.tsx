import CanonicalLocationModuleNav from "./CanonicalLocationModuleNav";

export default function LocationsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="location-dashboard-layout min-h-screen bg-[#050607] lg:flex">
      <CanonicalLocationModuleNav />
      <div className="min-w-0 flex-1">{children}</div>
      <style>{`
        @media (min-width: 1024px) {
          .location-dashboard-layout main[data-page-version] > div.grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .location-dashboard-layout main[data-page-version] > div.grid > aside:first-child {
            display: none !important;
          }
        }

        .location-dashboard-layout main[data-page-version] {
          padding-top: 0 !important;
        }

        .location-dashboard-layout main[data-page-version] header.sticky {
          top: 0 !important;
        }

        .location-dashboard-layout main[data-page-version] > div.grid > section > div.border-b.border-white\\/10 {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
