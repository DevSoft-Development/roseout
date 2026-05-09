import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Saved Plan Details",
  description: "View a saved TheOutHaven outing plan.",
  path: "/user/saved",
  noIndex: true,
});
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SavedPlanDetailPage({ params }: PageProps) {
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plan } = await supabase
    .from("saved_plans")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!plan) {
    redirect("/user/saved");
  }

  return (
    <main className="min-h-screen bg-[#0b0507] px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/user/saved"
          className="mb-8 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-bold hover:bg-white hover:text-black"
        >
          ← Back to Saved Plans
        </Link>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-rose-300">
            Saved TheOutHaven Plan
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            {plan.title || "Your TheOutHaven Plan"}
          </h1>

          <p className="mt-4 text-white/60">
            {plan.summary || "Here is your saved outing plan."}
          </p>

          <div className="mt-8 rounded-3xl bg-black/30 p-6">
            <pre className="whitespace-pre-wrap text-sm leading-7 text-white/80">
              {typeof plan.plan_data === "string"
                ? plan.plan_data
                : JSON.stringify(plan.plan_data, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}
