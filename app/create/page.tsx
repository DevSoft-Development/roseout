import GuidedCreatePageV2 from "./GuidedCreatePageV2";
import GuidedResultsPageV4 from "./GuidedResultsPageV4";
import GuidedSnapshotResultsPage from "./GuidedSnapshotResultsPage";
import AnchorAwareCreatePage from "./AnchorAwareCreatePage";

type CreatePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PlanType = "outing" | "restaurant" | "activity";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePlanType(value: string | undefined): PlanType {
  return value === "restaurant" || value === "activity" ? value : "outing";
}

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const params = searchParams ? await searchParams : {};
  const guided = firstParam(params.guided);
  const snapshot = firstParam(params.snapshot);
  const planExact = firstParam(params.planExact);
  const campaignSlug = firstParam(params.campaignSlug);
  const prompt = firstParam(params.prompt)?.trim() || "";
  const requestedStep = firstParam(params.step);
  const planType = normalizePlanType(firstParam(params.planType));

  if (guided === "results" && snapshot) {
    return <GuidedSnapshotResultsPage />;
  }

  if (guided === "results") {
    return <GuidedResultsPageV4 />;
  }

  if (planExact === "true" && campaignSlug) {
    return <AnchorAwareCreatePage />;
  }

  return (
    <GuidedCreatePageV2
      initialIdea={prompt}
      initialPlanType={planType}
      initialStep={requestedStep === "2" && prompt ? 2 : 1}
    />
  );
}
