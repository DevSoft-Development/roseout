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
        <div className="absolute left-[12.5%] right-[12.5%] top-[8px] h-px bg-white/15" aria-hidden="true">
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
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-[2px] h-3 w-3 rounded-full border-2 transition ${
                    active
                      ? "border-[#e1062a] bg-[#e1062a] shadow-[0_0_0_4px_rgba(225,6,42,0.12)]"
                      : complete
                        ? "border-[#e1062a] bg-[#e1062a]"
                        : "border-white/20 bg-[#050505]"
                  }`}
                />
                <p
                  className={`mt-2 max-w-full text-[7px] font-black leading-tight tracking-[0.035em] sm:text-[10px] sm:tracking-[0.1em] ${
                    active ? "text-white" : complete ? "text-white/60" : "text-white/30"
                  }`}
                >
                  {step.number}. {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
