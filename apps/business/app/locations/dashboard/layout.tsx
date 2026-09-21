import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import CanonicalLocationModuleNav from "./CanonicalLocationModuleNav";
import BusinessThemeProvider from "./BusinessThemeProvider";
import { ADMIN_DEMO_HANDOFF_COOKIE, verifyAdminDemoHandoff } from "@theouthaven/auth/admin-demo-handoff";

export default async function LocationsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const demoHandoff = verifyAdminDemoHandoff(
    cookieStore.get(ADMIN_DEMO_HANDOFF_COOKIE)?.value,
  );
  if (!user && !demoHandoff) {
    redirect("/business/login?next=/locations/dashboard");
  }

  return (
    <BusinessThemeProvider>
      <div className="location-dashboard-layout min-h-screen overflow-x-hidden bg-[var(--business-bg)] text-[var(--business-text)] md:flex">
        <Suspense fallback={null}>
          <CanonicalLocationModuleNav />
        </Suspense>
        <div className="location-dashboard-content min-w-0 max-w-full flex-1 overflow-x-hidden">{children}</div>
        <style>{`
        .business-dashboard-theme {
          --business-bg: #050607;
          --business-panel: #0b0d11;
          --business-panel-strong: #11141a;
          --business-border: rgba(255,255,255,.10);
          --business-text: #ffffff;
          --business-muted: rgba(255,255,255,.58);
          --business-muted-strong: rgba(255,255,255,.72);
          --business-sidebar: #06080b;
          background: var(--business-bg);
          color: var(--business-text);
        }

        .business-theme-light {
          --business-bg: #f6f3f0;
          --business-panel: #ffffff;
          --business-panel-strong: #f1ebe7;
          --business-border: rgba(60,38,32,.16);
          --business-text: #211714;
          --business-muted: rgba(57,41,36,.62);
          --business-muted-strong: rgba(57,41,36,.78);
          --business-sidebar: #fffdfb;
        }

        .business-theme-light .location-dashboard-layout {
          background: var(--business-bg) !important;
          color: var(--business-text) !important;
        }

        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-[#0"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-[#1"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-[#2"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-black"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-neutral-9"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-zinc-9"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-slate-9"] {
          background-color: var(--business-panel) !important;
        }

        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-gradient"][class*="from-[#0"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-gradient"][class*="from-[#1"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-gradient"][class*="to-[#0"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-gradient"][class*="to-[#1"],
        .business-theme-light .location-dashboard-content :is(main, section, article, aside, header, div)[class*="bg-[radial-gradient"] {
          background-image: none !important;
          background-color: var(--business-panel) !important;
        }

        .business-theme-light .location-dashboard-content :is(input, select, textarea)[class*="bg-[#0"],
        .business-theme-light .location-dashboard-content :is(input, select, textarea)[class*="bg-[#1"],
        .business-theme-light .location-dashboard-content :is(input, select, textarea)[class*="bg-black"] {
          background-color: var(--business-panel-strong) !important;
          color: var(--business-text) !important;
        }

        .business-theme-light .location-dashboard-content [class*="border-white/"] {
          border-color: var(--business-border) !important;
        }

        .business-theme-light .location-dashboard-content [class*="text-white"] {
          color: var(--business-text) !important;
        }

        .business-theme-light .location-dashboard-content [class*="text-white/"] {
          color: var(--business-muted) !important;
        }

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
    </BusinessThemeProvider>
  );
}
