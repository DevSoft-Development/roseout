import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Add User Admin",
  description: "Create a new TheOutHaven user from the admin dashboard.",
  path: "/admin/users/new",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
