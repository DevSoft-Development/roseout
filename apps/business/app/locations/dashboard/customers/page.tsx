import WorkspaceHub from "../_components/WorkspaceHub";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersHubPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  return (
    <WorkspaceHub
      eyebrow="Customers"
      title="Customers"
      description="Keep customer acquisition and relationship tools together while leaving Reviews as its own high-signal workspace."
      searchParams={params}
      items={[
        { title: "Leads", description: "Track private party and event inquiries from new request through booked or lost.", href: "/locations/dashboard/leads" },
        { title: "Offers", description: "Create offers and monitor customer claims and conversions.", href: "/locations/dashboard/offers" },
        { title: "VIP List", description: "Manage VIP signups, consent status, birthday months, and contact growth.", href: "/locations/dashboard/vip" },
        { title: "Notifications", description: "Manage recipients, preferences, unread alerts, and recent customer activity.", href: "/locations/dashboard/notifications" },
      ]}
    />
  );
}
