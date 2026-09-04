import GuidedCreatePageV2 from "./GuidedCreatePageV2";
import GuidedResultsPageV4 from "./GuidedResultsPageV4";
import GuidedSnapshotResultsPage from "./GuidedSnapshotResultsPage";
import AnchorAwareCreatePage from "./AnchorAwareCreatePage";
import TheOutHavenLoungeSearchResult from "./TheOutHavenLoungeSearchResult";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

export const dynamic = "force-dynamic";

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

function isTheOutHavenLoungePrompt(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return (
    normalized === "theouthaven lounge" ||
    normalized === "the outhaven lounge" ||
    normalized === "the out haven lounge"
  );
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

  if (prompt && isTheOutHavenLoungePrompt(prompt)) {
    const viewer = await getInternalDemoViewer().catch(() => null);
    if (viewer) {
      return <TheOutHavenLoungeSearchResult query="TheOutHaven Lounge" />;
    }
  }

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
