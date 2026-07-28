"use client";

import { useMemo, useState } from "react";

type LocationCard = {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  activity_type?: string | null;
  cuisine?: string | null;
};

type BuilderPayload = {
  enabled?: boolean;
  restaurants?: LocationCard[];
  activities?: LocationCard[];
};

function label(item: LocationCard) {
  return item.name || item.restaurant_name || item.activity_name || "Location";
}

function image(item: LocationCard) {
  return item.main_image || item.image_url || null;
}

function ChoiceCard({ item, selected, onSelect }: { item: LocationCard; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`overflow-hidden rounded-2xl border text-left transition ${selected ? "border-[#e1062a] bg-[#e1062a]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
    >
      <div className="aspect-[16/9] bg-white/5">
        {image(item) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image(item)!} alt={label(item)} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="p-4">
        <p className="font-black text-white">{label(item)}</p>
        <p className="mt-1 text-xs font-semibold text-white/45">
          {[item.cuisine || item.activity_type, item.city, item.state].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-[#e1062a]">
          {selected ? "Selected" : "Choose"}
        </p>
      </div>
    </button>
  );
}

export default function BuildYourOwnOuting({ builder }: { builder: BuilderPayload }) {
  const restaurants = builder.restaurants?.slice(0, 8) ?? [];
  const activities = builder.activities?.slice(0, 8) ?? [];
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const selectedRestaurant = useMemo(() => restaurants.find((item) => String(item.id) === restaurantId) ?? null, [restaurantId, restaurants]);
  const selectedActivity = useMemo(() => activities.find((item) => String(item.id) === activityId) ?? null, [activityId, activities]);

  if (!builder.enabled || !restaurants.length || !activities.length) return null;

  return (
    <section className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/35 p-5 sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">Build your own</p>
      <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Make your own complete outing</h2>
      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">
        Keep the recommended pairs above, or choose a restaurant and activity that fit you better.
      </p>

      <h3 className="mt-7 text-lg font-black text-white">Choose a restaurant</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {restaurants.map((item) => (
          <ChoiceCard key={String(item.id)} item={item} selected={String(item.id) === restaurantId} onSelect={() => setRestaurantId(String(item.id))} />
        ))}
      </div>

      <h3 className="mt-8 text-lg font-black text-white">Choose something to do</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {activities.map((item) => (
          <ChoiceCard key={String(item.id)} item={item} selected={String(item.id) === activityId} onSelect={() => setActivityId(String(item.id))} />
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Your outing</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="font-bold text-white">Restaurant: {selectedRestaurant ? label(selectedRestaurant) : "Choose one"}</p>
          <p className="font-bold text-white">Activity: {selectedActivity ? label(selectedActivity) : "Choose one"}</p>
        </div>
        <button type="button" disabled={!selectedRestaurant || !selectedActivity} className="mt-5 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
          Complete this outing
        </button>
      </div>
    </section>
  );
}
