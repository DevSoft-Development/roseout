import WorkspaceHub from "../_components/WorkspaceHub";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MarketingGrowthHubPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  return (
    <WorkspaceHub
      eyebrow="Marketing & growth"
      title="Marketing & growth"
      description="Run content, social connections, and promotion tools from one growth workspace while keeping Analytics directly accessible."
      searchParams={params}
      items={[
        { title: "Marketing Studio", description: "Create location-aware campaign ideas and draft marketing content.", href: "/locations/dashboard/marketing-studio" },
        { title: "Social Accounts", description: "Connect and manage supported social publishing accounts.", href: "/locations/dashboard/social-accounts" },
        { title: "Promotions", description: "Feature the location, boost visibility, and manage promotion opportunities.", href: "/locations/dashboard/promotions" },
      ]}
    />
  );
}
