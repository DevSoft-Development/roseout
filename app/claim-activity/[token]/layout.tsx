import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Claim Your Activity",
  description:
    "Claim and verify a TheOutHaven activity listing with a secure claim link.",
  path: "/claim-activity",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
