import GuidedCreatePageV2 from "./GuidedCreatePageV2";
import GuidedResultsPageV4 from "./GuidedResultsPageV4";
import GuidedSnapshotResultsPage from "./GuidedSnapshotResultsPage";
import AnchorAwareCreatePage from "./AnchorAwareCreatePage";
import HomepagePlannerStep2 from "./HomepagePlannerStep2";

type CreatePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const params = searchParams ? await searchParams : {};
  const guided = Array.isArray(params.guided) ? params.guided[0] : params.guided;
  const snapshot = Array.isArray(params.snapshot) ? params.snapshot[0] : params.snapshot;
  const planExact = Array.isArray(params.planExact) ? params.planExact[0] : params.planExact;
  const campaignSlug = Array.isArray(params.campaignSlug) ? params.campaignSlug[0] : params.campaignSlug;
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;

  if (guided === "results" && snapshot) {
    return <GuidedSnapshotResultsPage />;
  }

  if (guided === "results") {
    return <GuidedResultsPageV4 />;
  }

  if (from === "home" && prompt?.trim()) {
    return <HomepagePlannerStep2 />;
  }

  if (planExact === "true" && campaignSlug) {
    return <AnchorAwareCreatePage />;
  }

  return <GuidedCreatePageV2 />;
}
