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
  const active = steps.find((step) => step.number === activeStep) || steps[0];

  return (
    <div className={`guided-journey-steps relative z-40 mx-auto w-full sm:sticky sm:top-16 ${className}`}>
      <div className="mx-auto sm:hidden">
        <div
          className="rounded-[1rem] border border-white/10 bg-[#0a0a0b]/94 px-3.5 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
          aria-label={`Step ${activeStep} of 4`}
        >
          <div className="flex items-center" aria-hidden="true">
            {steps.map((step, index) => {
              const isActive = activeStep === step.number;
              const complete = activeStep > step.number;
              return (
                <div key={step.number} className="contents">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black transition-all duration-300 ${
                      isActive
                        ? "border-[#ff4665] bg-[#e1062a] text-white shadow-[0_0_0_3px_rgba(225,6,42,0.11),0_6px_14px_rgba(225,6,42,0.2)]"
                        : complete
                          ? "border-[#e1062a]/55 bg-[#16070a] text-[#ff7188]"
                          : "border-white/12 bg-[#111113] text-white/35"
                    }`}
                  >
                    {step.number}
                  </span>
                  {index < steps.length - 1 ? (
                    <span className={`mx-1.5 h-px min-w-0 flex-1 ${activeStep > step.number ? "bg-[#e1062a]/55" : "bg-white/12"}`} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.14em] text-white/78">
            <span className="text-white">{active.label}</span>
            <span className="mx-1.5 text-white/25">·</span>
            <span className="text-[#ff8297]">Step {activeStep} of 4</span>
          </p>
        </div>
      </div>

      <div className="mx-auto hidden sm:block">
        <div
          className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0a0a0b]/94 px-5 py-3 shadow-[0_16px_45px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl"
          aria-label={`Step ${activeStep} of 4`}
        >
          <div className="grid grid-cols-4 items-center gap-2">
            {steps.map((step) => {
              const isActive = activeStep === step.number;
              const complete = activeStep > step.number;
              return (
                <div
                  key={step.number}
                  aria-current={isActive ? "step" : undefined}
                  className="relative flex min-w-0 items-center justify-center px-2 py-1.5"
                >
                  <div className={`flex min-w-0 items-center gap-2.5 rounded-full px-2.5 py-1 transition-all duration-300 ${isActive ? "bg-[#e1062a]/10 shadow-[0_0_24px_rgba(225,6,42,0.09)]" : ""}`}>
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-base font-black transition-all duration-300 ${
                        isActive
                          ? "border-[#ff4665] bg-[#e1062a] text-white shadow-[0_0_0_4px_rgba(225,6,42,0.12),0_8px_22px_rgba(225,6,42,0.25)]"
                          : complete
                            ? "border-[#e1062a]/55 bg-[#16070a] text-[#ff7188]"
                            : "border-white/12 bg-[#111113] text-white/30"
                      }`}
                    >
                      {step.number}
                    </span>

                    <div className="min-w-0 text-left">
                      <p className={`truncate text-sm font-black tracking-[0.08em] ${isActive ? "text-white" : complete ? "text-white/58" : "text-white/28"}`}>
                        {step.label}
                      </p>
                      <p className={`mt-0.5 text-[13px] font-semibold ${isActive ? "text-[#ff8297]" : "text-white/20"}`}>
                        {step.short}
                      </p>
                    </div>
                  </div>

                  {step.number < 4 ? (
                    <span aria-hidden="true" className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-xl font-light text-white/14">
                      ›
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
