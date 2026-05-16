import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ReserveBookingForm from "@/components/ReserveBookingForm";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import {
  formatOperatingHoursForDisplay,
  getOperatingHours,
} from "@/lib/locationHours";

type LocationRow = {
  id: string;
  city: string | null;
  state: string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  default_duration_minutes: number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  rating?: number | null;
  theouthaven_score?: number | null;
  operating_hours?: any;
  special_hours?: any;
  holiday_closures?: any;
  hours?: string | null;
  hours_of_operation?: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
};

export default async function ReserveLocationPage({
  params,
}: {
  params: Promise<{ locationType: string; id: string }>;
}) {
  const { locationType, id } = await params;

  const isActivity = locationType === "activity";
  const tableName = isActivity ? "activities" : "restaurants";

  const hoursFields =
    "operating_hours, special_hours, holiday_closures, hours, hours_of_operation, days_of_operation, kitchen_closing_time";
  const selectFields = isActivity
    ? `id, name, activity_name, city, state, main_image, image_url, images, default_duration_minutes, rating, theouthaven_score, ${hoursFields}`
    : `id, name, restaurant_name, city, state, main_image, image_url, images, default_duration_minutes, rating, theouthaven_score, ${hoursFields}`;

  const { data, error } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const location = data as LocationRow;

  const locationName = getLocationName(location, isActivity ? "Activity" : "Restaurant");

  const backHref = `/locations/${isActivity ? "activities" : "restaurants"}/${id}`;
  const operatingHoursDisplay = formatOperatingHoursForDisplay(
    getOperatingHours(location)
  );

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ← Back to location
          </Link>

          <div className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-rose-200">
            TheOutHaven Reserve
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#120d0b] shadow-2xl">
          <div className="relative min-h-[360px] overflow-hidden bg-black">
            {getLocationImage(location) ? (
              <img
                src={getLocationImage(location)}
                alt={locationName}
                className="h-[360px] w-full object-cover opacity-80"
              />
            ) : (
              <div className="flex h-[360px] items-center justify-center bg-gradient-to-br from-rose-950 via-black to-[#090706] text-6xl">
                🌹
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#090706] via-black/35 to-transparent" />

            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                    {isActivity ? "Experience Booking" : "Reservation Booking"}
                  </p>

                  <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
                    {locationName}
                  </h1>

                  <p className="mt-3 text-sm font-semibold text-white/65">
                    {location.city || "New York"}, {location.state || "NY"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                      Rating
                    </p>
                    <p className="mt-1 text-xl font-black">
                      🌹 {location.rating || 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                      Duration
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {location.default_duration_minutes || 90} min
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                      Score
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {location.theouthaven_score || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1fr_440px]">
            <div className="hidden border-r border-white/10 bg-[#0d0908] p-6 lg:block">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                  Booking Details
                </p>

                <h2 className="mt-3 text-2xl font-black">
                  Choose your date and time
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/55">
                  TheOutHaven checks existing bookings and only shows available
                  reservation times based on this location’s booking duration.
                </p>

                <div className="mt-5 grid gap-3">
                  <div className="rounded-2xl bg-white/[0.06] p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">
                      Availability
                    </p>
                    <p className="mt-1 text-sm font-bold text-white/70">
                      Open times update after choosing a date.
                    </p>
                  </div>

                  {operatingHoursDisplay && (
                    <div className="rounded-2xl bg-white/[0.06] p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-white/40">
                        Hours
                      </p>
                      <p className="mt-1 text-sm font-bold text-white/70">
                        {operatingHoursDisplay}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl bg-white/[0.06] p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">
                      Confirmation
                    </p>
                    <p className="mt-1 text-sm font-bold text-white/70">
                      Guests submit a request and the location can confirm it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <ReserveBookingForm
              locationId={id}
              locationType={locationType}
              locationName={locationName}
              defaultDuration={location.default_duration_minutes || 90}
            />
          </div>
        </section>
      </div>
    </main>
  );
}