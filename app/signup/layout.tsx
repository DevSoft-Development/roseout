import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sign Up",
  description:
    "Create your TheOutHaven account to plan outings and save personalized recommendations.",
  path: "/signup",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
