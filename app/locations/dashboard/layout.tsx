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

          .location-dashboard-layout .location-workspace-reserve .reserve-command-center > div.grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .location-dashboard-layout .location-workspace-reserve .reserve-command-center > div.grid > aside:first-child {
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

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center,
        .location-dashboard-layout .location-workspace-reserve .reserve-command-center > div.grid {
          height: auto !important;
          min-height: 100vh !important;
          overflow: visible !important;
        }

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center > div.grid > section {
          overflow: visible !important;
          min-height: 100vh;
        }

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center header.sticky {
          top: 0 !important;
        }

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center header > nav[aria-label="Reserve sections"] {
          display: none !important;
        }

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center header h1 {
          font-size: 0 !important;
        }

        .location-dashboard-layout .location-workspace-reserve .reserve-command-center header h1::after {
          content: "Reservations";
          font-size: 1.5rem;
          line-height: 2rem;
          font-weight: 900;
          letter-spacing: -0.025em;
        }
      `}</style>
    </div>
  );
}
