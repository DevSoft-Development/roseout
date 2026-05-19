import type { Metadata } from "next";
import LoginPage from "@/app/login/page";

export const metadata: Metadata = {
  title: "Create Your Account | TheOutHaven",
  description:
    "Create your free TheOutHaven account to discover restaurants, activities, personalized outing ideas, and premium nightlife experiences.",
  openGraph: {
    title: "Create Your Account | TheOutHaven",
    description:
      "Create your free TheOutHaven account to discover restaurants, activities, personalized outing ideas, and premium nightlife experiences.",
    url: "/signup",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Your Account | TheOutHaven",
    description:
      "Create your free TheOutHaven account to discover restaurants, activities, personalized outing ideas, and premium nightlife experiences.",
  },
  alternates: {
    canonical: "/signup",
  },
};

export default function SignupPage() {
  return <LoginPage initialTab="signup" />;
}
