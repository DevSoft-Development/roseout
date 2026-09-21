"use client";

import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";
import ReserveOverviewPage from "@/components/reserve/ReserveOverviewPage";
import { useBusinessTheme } from "./BusinessThemeProvider";

export default function BusinessReserveWorkspace({ overview }: { overview: boolean }) {
  const { theme } = useBusinessTheme();
  return overview ? (
    <ReserveOverviewPage forcedTheme={theme} />
  ) : (
    <ReserveCommandCenterPage forcedTheme={theme} />
  );
}
