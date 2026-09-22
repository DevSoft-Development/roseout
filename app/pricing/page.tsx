import { redirect } from "next/navigation";

export default function PricingPage() {
  const businessOrigin = String(
    process.env.NEXT_PUBLIC_BUSINESS_SITE_URL || "https://business.theouthaven.com",
  ).replace(/\/$/, "");
  redirect(`${businessOrigin}/business/plans`);
}
