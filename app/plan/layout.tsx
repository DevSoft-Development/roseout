import type { ReactNode } from "react";
import PlanContinuityOverlay from "./PlanContinuityOverlay";

export default function PlanLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PlanContinuityOverlay />
    </>
  );
}
