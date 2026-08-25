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
  return (
    <div className="sticky top-0 z-40 -mx-4 border-b border-white/10 bg-[#050505]/92 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-[#050505]/78 sm:-mx-6 sm:px-6">
      <div
        className={`grid grid-cols-4 gap-2 sm:gap-4 ${className}`}
        aria-label={`Step ${activeStep} of 4`}
      >
        {steps.map((step) => {
          const active = activeStep === step.number;
          const complete = activeStep > step.number;
          return (
            <div key={step.number} aria-current={active ? "step" : undefined}>
              <div
                className={`h-1 rounded-full transition ${
                  active || complete ? "bg-[#e1062a]" : "bg-white/10"
                }`}
              />
              <p
                className={`mt-2 whitespace-nowrap text-[8px] font-black tracking-[0.08em] sm:text-[10px] sm:tracking-[0.12em] ${
                  active ? "text-white" : complete ? "text-white/55" : "text-white/25"
                }`}
              >
                {step.number}. {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
