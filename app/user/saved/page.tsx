import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Saved Plans",
  description:
    "Review the outing plans and recommendations you saved on TheOutHaven.",
  path: "/user/saved",
  noIndex: true,
});
export default async function SavedPlansPage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plans } = await supabase
    .from("saved_plans")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-[#0b0507] px-6 py-10 text-white">
      <TheOutHavenHeader />
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rose-300">
              TheOutHaven
            </p>
            <h1 className="mt-2 text-4xl font-bold">Saved Plans</h1>
          </div>

          <Link
            href="/user/dashboard"
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold hover:bg-white hover:text-black"
          >
            Back to Portal
          </Link>
        </div>

        {!plans || plans.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center">
            <h2 className="text-2xl font-bold">No saved plans yet</h2>
            <p className="mt-2 text-white/50">
              Your saved restaurants, activities, and outings will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: any) => (
              <div
                key={plan.id}
                className="rounded-3xl border border-white/10 bg-white/[0.05] p-6"
              >
                <h2 className="text-xl font-bold">
                  {plan.title || "TheOutHaven Plan"}
                </h2>
                <p className="mt-3 line-clamp-4 text-sm text-white/60">
                  {plan.summary || "Saved TheOutHaven outing."}
                </p>

                <Link
                  href={`/user/saved/${plan.id}`}
                  className="mt-5 inline-flex rounded-full bg-rose-500 px-5 py-2 text-sm font-bold hover:bg-rose-400"
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
