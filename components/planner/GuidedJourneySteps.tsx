type GuidedJourneyStep = 1 | 2 | 3 | 4;

const steps: Array<{ number: GuidedJourneyStep; label: string; short: string }> = [
  { number: 1, label: "PLAN", short: "Start" },
  { number: 2, label: "MAKE IT YOURS", short: "Personalize" },
  { number: 3, label: "PICK", short: "Choose" },
  { number: 4, label: "COMPLETE OUTING", short: "Finish" },
];

export default function GuidedJourneySteps({
  activeStep,
  className = "",
}: {
  activeStep: GuidedJourneyStep;
  className?: string;
}) {
  return (
    <div className="guided-journey-steps sticky top-16 z-40 w-full px-3 py-2.5 sm:px-5">
      <div
        className={`mx-auto overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0a0a0b]/94 px-3 py-3 shadow-[0_16px_45px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl sm:px-5 ${className}`}
        aria-label={`Step ${activeStep} of 4`}
      >
        <div className="grid grid-cols-4 items-center gap-1 sm:gap-2">
          {steps.map((step) => {
            const active = activeStep === step.number;
            const complete = activeStep > step.number;
            return (
              <div
                key={step.number}
                aria-current={active ? "step" : undefined}
                className="relative flex min-w-0 items-center justify-center px-1 py-1.5 sm:px-2"
              >
                <div className={`flex min-w-0 items-center gap-2 rounded-full px-1.5 py-1 transition-all duration-300 sm:gap-2.5 sm:px-2.5 ${active ? "bg-[#e1062a]/10 shadow-[0_0_24px_rgba(225,6,42,0.09)]" : ""}`}>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black transition-all duration-300 sm:h-10 sm:w-10 sm:text-base ${
                      active
                        ? "border-[#ff4665] bg-[#e1062a] text-white shadow-[0_0_0_4px_rgba(225,6,42,0.12),0_8px_22px_rgba(225,6,42,0.25)]"
                        : complete
                          ? "border-[#e1062a]/55 bg-[#16070a] text-[#ff7188]"
                          : "border-white/12 bg-[#111113] text-white/30"
                    }`}
                  >
                    {step.number}
                  </span>

                  <div className="min-w-0 text-left">
                    <p className={`truncate text-[10px] font-black tracking-[0.04em] sm:text-sm sm:tracking-[0.08em] ${active ? "text-white" : complete ? "text-white/58" : "text-white/28"}`}>
                      {step.label}
                    </p>
                    <p className={`mt-0.5 hidden text-xs font-semibold sm:block sm:text-[13px] ${active ? "text-[#ff8297]" : "text-white/20"}`}>
                      {step.short}
                    </p>
                  </div>
                </div>

                {step.number < 4 ? (
                  <span aria-hidden="true" className="absolute -right-1 top-1/2 -translate-y-1/2 text-lg font-light text-white/14 sm:-right-1.5 sm:text-xl">
                    ›
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
