import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "AI Outing Planner for Dates, Dining & Activities",
  description:
    "Discover restaurants, activities, and experiences tailored to your vibe, budget, mood, and location with TheOutHaven.",
  path: "/",
});
export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

export default async function HomePage() {
  const supabase = adminSupabase();

  const { data: topRestaurants } = await supabase
    .from("restaurants")
    .select(
      "id,restaurant_name,name,cuisine,city,state,image_url,photo_url,theouthaven_score,ranking_badge,trend_score,conversion_score",
    )
    .eq("ranking_badge", "Top 10%")
    .order("theouthaven_score", { ascending: false })
    .limit(4);

  const { data: trendingRestaurants } = await supabase
    .from("restaurants")
    .select(
      "id,restaurant_name,name,cuisine,city,state,image_url,photo_url,theouthaven_score,ranking_badge,trend_score,conversion_score",
    )
    .order("trend_score", { ascending: false })
    .limit(4);

  const { data: highIntentPicks } = await supabase
    .from("restaurants")
    .select(
      "id,restaurant_name,name,cuisine,city,state,image_url,photo_url,theouthaven_score,ranking_badge,trend_score,conversion_score",
    )
    .order("conversion_score", { ascending: false })
    .limit(4);

  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative min-h-screen overflow-hidden pt-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.24),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(225,6,42,0.18),transparent_30%),linear-gradient(180deg,#050505,#000)]" />

        <div className="absolute right-0 top-20 hidden h-[620px] w-[56vw] overflow-hidden rounded-bl-[18rem] border-l border-red-500/20 border-t border-red-500/20 lg:block">
          <div className="absolute inset-0 bg-[url('/hero-outing.jpg')] bg-cover bg-center opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/35 to-black/10" />
          <div className="absolute inset-0 rounded-bl-[18rem] ring-1 ring-red-500/20" />
        </div>

        <div className="absolute right-[8%] top-[18%] hidden h-[560px] w-[560px] rounded-full border border-red-500/25 lg:block" />
        <div className="absolute right-[4%] top-[24%] hidden h-[470px] w-[470px] rounded-full border border-red-500/15 lg:block" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-6rem)] max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-red-500">
              AI-powered outing planner
            </p>

            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Plan your
              <br />
              <span className="text-[#e1062a]">perfect outing.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-white/55 md:text-lg">
              AI-powered planning for unforgettable experiences, tailored to
              your vibe, budget, location, and mood.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#e1062a] px-8 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
              >
                Plan My Outing
                <span>→</span>
              </Link>

              <Link
                href="#rankings"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-black text-white/75 backdrop-blur transition hover:bg-white hover:text-black"
              >
                See What’s Trending
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div className="flex -space-x-3">
                {["A", "B", "C", "D"].map((item) => (
                  <div
                    key={item}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black bg-white text-xs font-black text-black"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <p className="text-sm font-semibold text-white/50">
                10,000+ outings planned
              </p>
            </div>
          </div>

          <div className="hidden lg:block" />
        </div>
      </section>

      <section
        id="rankings"
        className="relative border-y border-white/10 bg-[#070707] px-6 py-14"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">
                Live TheOutHaven Rankings
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight">
                What people are loving now
              </h2>
            </div>

            <Link
              href="/create"
              className="rounded-2xl bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
            >
              Find My Outing
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <CompactRankingSection
              title="Trending Now"
              subtitle="Live Ranking Engine"
              restaurants={trendingRestaurants || []}
            />

            <CompactRankingSection
              title="Top 10%"
              subtitle="Best of TheOutHaven"
              restaurants={topRestaurants || []}
            />

            <CompactRankingSection
              title="Ready to Book"
              subtitle="High Intent Picks"
              restaurants={highIntentPicks || []}
            />
          </div>
        </div>
      </section>

      <section className="bg-black px-6 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-3">
          <FeatureBlock
            number="01"
            title="Tell TheOutHaven the vibe"
            text="Type what you want in plain English — romantic, casual, rooftop, quiet, fun, budget-friendly, or luxury."
          />

          <FeatureBlock
            number="02"
            title="Get a curated plan"
            text="TheOutHaven matches restaurants, activities, location, timing, and intent into one polished outing."
          />

          <FeatureBlock
            number="03"
            title="Book and go"
            text="Use direct links for reservations, websites, directions, and saved plans without endless scrolling."
          />
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-black">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1062a]">
              Smarter than search
            </p>

            <h2 className="mt-4 text-5xl font-black tracking-tight">
              Built for outings, not endless lists.
            </h2>

            <p className="mt-5 text-lg leading-8 text-black/65">
              TheOutHaven ranks places by real behavior — what people view,
              click, save, reserve, and return to. That means better
              recommendations and faster decisions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LightFeature text="AI-powered outing recommendations" />
            <LightFeature text="Live ranking signals" />
            <LightFeature text="Top 10% and Trending badges" />
            <LightFeature text="Restaurant and activity planning" />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-black px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),transparent_38%)]" />

        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-red-500">
            Start now
          </p>

          <h2 className="mt-4 text-5xl font-black tracking-tight md:text-6xl">
            Your next outing starts with one sentence.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/55">
            Stop scrolling. Tell TheOutHaven what you want and get a polished
            plan in seconds.
          </p>

          <Link
            href="/create"
            className="mt-10 inline-flex rounded-2xl bg-[#e1062a] px-10 py-5 text-lg font-black text-white shadow-2xl shadow-red-500/30 transition hover:bg-red-500"
          >
            Plan My Outing →
          </Link>
        </div>
      </section>
    </main>
  );
}

function CompactRankingSection({
  title,
  subtitle,
  restaurants,
}: {
  title: string;
  subtitle: string;
  restaurants: any[];
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-5 shadow-2xl shadow-black/30">
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500">
        {subtitle}
      </p>

      <h2 className="mt-2 text-2xl font-black">{title}</h2>

      <div className="mt-5 space-y-3">
        {restaurants?.length ? (
          restaurants.slice(0, 3).map((restaurant) => {
            const name =
              restaurant.restaurant_name || restaurant.name || "Restaurant";
            const image = restaurant.image_url || restaurant.photo_url;

            return (
              <Link
                key={restaurant.id}
                href={`/locations/restaurants/${restaurant.id}`}
                className="flex gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 transition hover:border-red-500/50 hover:bg-red-500/10"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/10">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl">
                      🍽️
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-black">{name}</h3>

                    <span className="rounded-full bg-[#e1062a] px-2 py-0.5 text-[10px] font-black text-white">
                      {Math.round(restaurant.theouthaven_score || 0)}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-xs text-white/40">
                    {restaurant.cuisine || "Restaurant"}
                  </p>

                  <p className="mt-1 truncate text-xs text-white/35">
                    {[restaurant.city, restaurant.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>

                  {restaurant.ranking_badge && (
                    <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/50">
                      {restaurant.ranking_badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-5 text-center">
            <p className="text-sm font-bold text-white/40">
              No ranked locations yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureBlock({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0d0d0d] p-7">
      <p className="text-sm font-black text-[#e1062a]">{number}</p>
      <h3 className="mt-4 text-2xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/50">{text}</p>
    </div>
  );
}

function LightFeature({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm font-black shadow-lg shadow-black/5">
      {text}
    </div>
  );
}
