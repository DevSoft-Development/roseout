"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";
import GuidedCompleteOuting from "./GuidedCompleteOuting";
import PlanContinuityOverlay from "./PlanContinuityOverlay";

export default function PlanJourneyGate({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const isGuided = searchParams.get("guidedFlow") === "guided_create_v1";

  if (isGuided) {
    return (
      <div className="guided-plan-shell min-h-screen bg-[#050505] px-4 text-white sm:px-6">
        <GuidedJourneySteps activeStep={4} className="mx-auto max-w-4xl" />
        <div className="guided-plan-body -mx-4 sm:-mx-6">
          <GuidedCompleteOuting />
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <PlanContinuityOverlay />
    </>
  );
}
