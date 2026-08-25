type GuidedJourneyStep = 1 | 2 | 3 | 4;

const steps: Array<{ number: GuidedJourneyStep; label: string }> = [
  { number: 1, label: "PLAN" },
  { number: 2, label: "MAKE IT YOURS" },
  { number: 3, label: "PICK" },
  { number: 4, label: "COMPLETE OUTING" },
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
    <div className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#050505]/94 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-[#050505]/82 sm:px-6">
      <div className={`relative mx-auto w-full ${className}`} aria-label={`Step ${activeStep} of 4`}>
        <div className="absolute left-[12.5%] right-[12.5%] top-[13px] h-px bg-white/15" aria-hidden="true">
          <div
            className="h-px bg-[#e1062a] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="relative grid grid-cols-4">
          {steps.map((step) => {
            const active = activeStep === step.number;
            const complete = activeStep > step.number;
            return (
              <div
                key={step.number}
                aria-current={active ? "step" : undefined}
                className="flex min-w-0 flex-col items-center text-center"
              >
                <div
                  className={`relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[9px] font-black transition sm:h-7 sm:w-7 sm:text-[10px] ${
                    active
                      ? "border-[#e1062a] bg-[#e1062a] text-white shadow-[0_0_0_4px_rgba(225,6,42,0.12)]"
                      : complete
                        ? "border-[#e1062a] bg-[#050505] text-[#e1062a]"
                        : "border-white/15 bg-[#050505] text-white/35"
                  }`}
                >
                  {complete ? "✓" : step.number}
                </div>
                <p
                  className={`mt-2 max-w-full whitespace-nowrap text-[7px] font-black tracking-[0.04em] sm:text-[10px] sm:tracking-[0.1em] ${
                    active ? "text-white" : complete ? "text-white/60" : "text-white/30"
                  }`}
                >
                  <span className="hidden sm:inline">{step.number}. </span>{step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
