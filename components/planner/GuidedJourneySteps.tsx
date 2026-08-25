type GuidedJourneyStep = 1 | 2 | 3 | 4;

const steps: Array<{ number: GuidedJourneyStep; label: string }> = [
  { number: 1, label: "Plan" },
  { number: 2, label: "Make It Yours" },
  { number: 3, label: "Pick" },
  { number: 4, label: "Complete Outing" },
];

export default function GuidedJourneySteps({
  activeStep,
  className = "",
}: {
  activeStep: GuidedJourneyStep;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-4 gap-2 sm:gap-4 ${className}`} aria-label={`Step ${activeStep} of 4`}>
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
              className={`mt-2 text-[8px] font-black uppercase tracking-[0.08em] sm:text-[10px] sm:tracking-[0.12em] ${
                active ? "text-white" : complete ? "text-white/55" : "text-white/25"
              }`}
            >
              {step.number}. {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
