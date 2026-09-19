import type { Metadata } from "next";
import LoginPage from "@/app/login/page";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Sign Up",
  description: "Create a TheOutHaven account to discover and save restaurants, activities, and outing ideas across NYC and Long Island.",
  path: "/signup",
  noIndex: true,
});

export default function SignupPage() {
  return <LoginPage initialTab="signup" />;
}
