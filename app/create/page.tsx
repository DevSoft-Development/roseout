import GuidedCreatePage from "./GuidedCreatePage";
import GuidedResultsPageV2 from "./GuidedResultsPageV2";
import AnchorAwareCreatePage from "./AnchorAwareCreatePage";

type CreatePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const params = searchParams ? await searchParams : {};
  const guided = Array.isArray(params.guided) ? params.guided[0] : params.guided;
  const planExact = Array.isArray(params.planExact) ? params.planExact[0] : params.planExact;
  const campaignSlug = Array.isArray(params.campaignSlug) ? params.campaignSlug[0] : params.campaignSlug;

  if (guided === "results") {
    return <GuidedResultsPageV2 />;
  }

  if (planExact === "true" && campaignSlug) {
    return <AnchorAwareCreatePage />;
  }

  return <GuidedCreatePage />;
}
