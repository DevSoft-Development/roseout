import type { ReactNode } from "react";
import { Suspense } from "react";
import PlanJourneyGate from "./PlanJourneyGate";
import "./guided-plan-shell.css";

export default function PlanLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PlanJourneyGate>{children}</PlanJourneyGate>
    </Suspense>
  );
}
