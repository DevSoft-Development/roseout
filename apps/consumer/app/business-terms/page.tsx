import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "Business Listing Terms – TheOutHaven",
  description: "Terms for business owners listing and claiming locations on TheOutHaven.",
};

export default function BusinessTermsPage() {
  return <main className="min-h-screen bg-black pb-24 text-white"><TheOutHavenHeader /><section className="mx-auto max-w-4xl px-6 pt-28"><h1 className="text-4xl font-black">Business Listing Terms</h1><p className="mt-4 text-white/70">By submitting or claiming a listing, you confirm you are authorized to represent the business, all listing content is accurate, and you will promptly correct outdated information. TheOutHaven may review, edit, suspend, or remove listings to protect data quality and user trust. Listing abuse, fake reviews, or fraudulent claims may result in removal and account restrictions.</p></section></main>;
}
