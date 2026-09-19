"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";
import GuidedCompleteOuting from "./GuidedCompleteOuting";
import GuidedCompletionOverview from "./GuidedCompletionOverview";
import PlanContinuityOverlay from "./PlanContinuityOverlay";

export default function PlanJourneyGate({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const isGuided = searchParams.get("guidedFlow") === "guided_create_v1";

  if (isGuided) {
    return (
      <div className="guided-plan-shell min-h-screen bg-[#050505] text-white">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.16),transparent_35%),#070707] px-4 pb-7 pt-20 sm:px-6 sm:pb-9">
          <GuidedJourneySteps activeStep={4} className="mx-auto max-w-4xl" />
          <div className="mx-auto mt-6 max-w-6xl">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 4 of 4 · Complete outing</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">Finish your outing.</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">Book what needs a reservation, confirm what you completed, then keep the finished plan with you.</p>
          </div>
        </div>

        <GuidedCompletionOverview />

        <div className="guided-completion-inner">
          <GuidedCompleteOuting />
        </div>

        <style jsx global>{`
          .guided-completion-inner > main > section:first-child {
            display: none;
          }
          .guided-completion-inner > main > section:nth-child(2) > div:first-child {
            display: none;
          }
          .guided-completion-inner > main {
            min-height: 0;
          }
        `}</style>
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
