import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Claim Your Location",
  description:
    "Claim and verify a TheOutHaven location listing with a secure claim link.",
  path: "/claim",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
