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
  const progress = ((activeStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#050505]/88 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[#050505]/72 sm:px-5">
      <div
        className={`relative mx-auto overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-5 ${className}`}
        aria-label={`Step ${activeStep} of 4`}
      >
        <div className="absolute left-[11%] right-[11%] top-[27px] h-[2px] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#e1062a,#ff3b5c)] shadow-[0_0_16px_rgba(225,6,42,0.55)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="relative grid grid-cols-4 gap-1 sm:gap-3">
          {steps.map((step) => {
            const active = activeStep === step.number;
            const complete = activeStep > step.number;
            return (
              <div
                key={step.number}
                aria-current={active ? "step" : undefined}
                className={`group relative flex min-w-0 flex-col items-center rounded-2xl px-1 py-1.5 text-center transition-all duration-300 sm:px-3 ${
                  active ? "bg-[#e1062a]/10 shadow-[inset_0_0_0_1px_rgba(225,6,42,0.22)]" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-black transition-all duration-300 sm:h-9 sm:w-9 sm:text-xs ${
                    active
                      ? "scale-110 border-[#ff4665] bg-[#e1062a] text-white shadow-[0_0_0_5px_rgba(225,6,42,0.12),0_8px_24px_rgba(225,6,42,0.28)]"
                      : complete
                        ? "border-[#e1062a]/70 bg-[#19070b] text-[#ff6a82]"
                        : "border-white/15 bg-[#0b0b0c] text-white/35"
                  }`}
                >
                  {step.number}
                </span>
                <p className={`mt-2 truncate text-[7px] font-black tracking-[0.055em] sm:text-[10px] sm:tracking-[0.11em] ${active ? "text-white" : complete ? "text-white/62" : "text-white/32"}`}>
                  {step.label}
                </p>
                <p className={`mt-0.5 hidden text-[9px] font-semibold sm:block ${active ? "text-[#ff8ea0]" : "text-white/22"}`}>
                  {step.short}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
