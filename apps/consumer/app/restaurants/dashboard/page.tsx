"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import RestaurantTopBar from "@/app/restaurants/components/RestaurantTopBar";
import { getLocationName } from "@/lib/locationName";
import { getPublicVisibilityWarning } from "@/lib/locationVisibility";
import { formatFullAddress } from "@/lib/address-utils";

export default function RestaurantDashboardPage() {
  const supabase = createClient();

  const [restaurant, setRestaurant] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRestaurant = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      window.location.href = "/restaurants/apply";
      return;
    }

    const { data, error } = await supabase
      .from("locations")
      .select("id,email,owner_email,name,restaurant_name,address,city,state,zip_code,description,status,is_searchable,data_status,missing_fields,is_hidden")
      .eq("owner_user_id", userData.user.id)
      .eq("location_type", "restaurant")
      .single();

    if (error) {
      setMessage("No restaurant listing found for this account.");
      setLoading(false);
      return;
    }

    setRestaurant(data);

    await fetch("/api/restaurants/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: data.id,
        email: data.email || data.owner_email,
        event_type: "dashboard_viewed",
      }),
    });
    setLoading(false);
  };

  const sendLoginLink = async () => {
    if (!restaurant?.email) return;

    setMessage("Sending login link...");

    const res = await fetch("/api/restaurants/send-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: restaurant.email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to send login link.");
      return;
    }

    setMessage("Check your email for a new login link.");
  };

  useEffect(() => {
    loadRestaurant();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <RestaurantTopBar />
        <div className="px-6 py-12">Loading...</div>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="min-h-screen bg-black text-white">
        <RestaurantTopBar />
        <div className="px-6 py-12">{message}</div>
      </main>
    );
  }

  const visibilityWarnings = getPublicVisibilityWarning(restaurant);

  return (
    <main className="min-h-screen bg-black text-white">
      <RestaurantTopBar />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-4xl font-bold">Restaurant Dashboard</h1>

        <p className="mt-3 text-neutral-400">View your restaurant listing.</p>

        <div className="mt-8 rounded-3xl bg-white p-6 text-black">
          <h2 className="text-2xl font-bold">
            {getLocationName(restaurant, "Restaurant")}
          </h2>

          <p className="mt-2 rounded-xl bg-yellow-500 px-4 py-3 font-semibold">
            Status: {restaurant.status}
          </p>

          {visibilityWarnings.length > 0 && (
            <p className="mt-3 rounded-xl bg-amber-100 px-4 py-3 font-semibold text-amber-950">
              This location is not visible in public search yet. Missing:{" "}
              {visibilityWarnings.join(", ")}.
            </p>
          )}

          <p className="mt-4">
            {formatFullAddress({
              address: restaurant.address,
              city: restaurant.city,
              state: restaurant.state,
              zip_code: restaurant.zip_code,
            })}
          </p>

          {restaurant.description && (
            <p className="mt-4 leading-7">{restaurant.description}</p>
          )}

          <a href="/restaurants/update">
            <button className="mt-6 w-full rounded-xl bg-yellow-500 px-6 py-3 font-bold">
              Edit Restaurant Listing
            </button>
          </a>

          <button
            onClick={sendLoginLink}
            className="mt-4 w-full rounded-xl bg-black px-6 py-3 text-white"
          >
            Send me a new login link
          </button>
        </div>

        {message && (
          <p className="mt-6 rounded-xl bg-white p-4 text-center font-semibold text-black">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
