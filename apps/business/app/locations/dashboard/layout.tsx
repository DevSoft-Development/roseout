import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import CanonicalLocationModuleNav from "./CanonicalLocationModuleNav";

export default async function LocationsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/locations/dashboard");

  return (
    <div className="location-dashboard-layout min-h-screen overflow-x-hidden bg-[#050607] md:flex">
      <Suspense fallback={null}>
        <CanonicalLocationModuleNav />
      </Suspense>
      <div className="location-dashboard-content min-w-0 max-w-full flex-1 overflow-x-hidden">{children}</div>
      <style>{`
        .location-dashboard-layout,
        .location-dashboard-content,
        .location-dashboard-content main {
          min-width: 0;
          max-width: 100%;
        }

        .location-dashboard-content img,
        .location-dashboard-content video,
        .location-dashboard-content canvas,
        .location-dashboard-content iframe,
        .location-dashboard-content input,
        .location-dashboard-content select,
        .location-dashboard-content textarea {
          max-width: 100%;
        }

        .location-dashboard-content [class*="overflow-x-auto"] {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-inline: contain;
        }

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
          min-width: 0;
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

        @media (max-width: 767px) {
          .location-dashboard-content main > div[class*="px-"] {
            max-width: 100%;
          }

          .location-dashboard-content button,
          .location-dashboard-content a,
          .location-dashboard-content input,
          .location-dashboard-content select,
          .location-dashboard-content textarea {
            touch-action: manipulation;
          }
        }
      `}</style>
    </div>
  );
}
