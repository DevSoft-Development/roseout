"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import RestaurantTopBar from "@/app/restaurants/components/RestaurantTopBar";
import GoogleAddressAutocomplete, {
  type GoogleAddressFields,
} from "@/components/GoogleAddressAutocomplete";

type RestaurantRecord = Record<string, unknown> & { id?: string };

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export default function RestaurantUpdatePage() {
  const supabase = createClient();

  const [restaurant, setRestaurant] = useState<RestaurantRecord | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRestaurant = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      window.location.href = "/restaurants/apply";
      return;
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_user_id", userData.user.id)
      .single();

    if (error) {
      setMessage("No restaurant listing found.");
      setLoading(false);
      return;
    }

    setRestaurant(data);
    setLoading(false);
  };

  const update = (key: string, value: string) => {
    setRestaurant((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveRestaurant = async () => {
    if (!restaurant?.id) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("restaurants")
      .update(restaurant)
      .eq("id", restaurant.id);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Saved successfully.");
    setSaving(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <main className="min-h-screen bg-black text-white">
      <RestaurantTopBar />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/restaurants/dashboard" className="underline">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-6 text-4xl font-bold">Edit Listing</h1>

        <div className="mt-8 space-y-4 rounded-3xl bg-white p-6 text-black">
          <input className="w-full rounded-xl border px-4 py-3" value={stringValue(restaurant.restaurant_name)} onChange={(e) => update("restaurant_name", e.target.value)} />
          <GoogleAddressAutocomplete
            value={stringValue(restaurant.address)}
            address={stringValue(restaurant.address)}
            city={stringValue(restaurant.city)}
            state={stringValue(restaurant.state)}
            zip_code={stringValue(restaurant.zip_code)}
            neighborhood={stringValue(restaurant.neighborhood)}
            latitude={stringValue(restaurant.latitude)}
            longitude={stringValue(restaurant.longitude)}
            google_place_id={stringValue(restaurant.google_place_id)}
            formatted_address={stringValue(restaurant.formatted_address)}
            onAddressChange={(value) => update("address", value)}
            onAddressSelect={(selected: GoogleAddressFields) =>
              setRestaurant((prev) => (prev ? { ...prev, ...selected } : prev))
            }
            inputClassName="mt-2 w-full rounded-xl border px-4 py-3"
            labelClassName="text-sm font-bold"
          />
          <input className="w-full rounded-xl border px-4 py-3" value={stringValue(restaurant.city)} onChange={(e) => update("city", e.target.value)} placeholder="City" />
          <input className="w-full rounded-xl border px-4 py-3" value={stringValue(restaurant.state)} onChange={(e) => update("state", e.target.value)} placeholder="State" />
          <input className="w-full rounded-xl border px-4 py-3" value={stringValue(restaurant.zip_code)} onChange={(e) => update("zip_code", e.target.value)} placeholder="Zip code" />

          <textarea
            className="min-h-32 w-full rounded-xl border px-4 py-3"
            value={stringValue(restaurant.description)}
            onChange={(e) => update("description", e.target.value)}
          />

          <button
            onClick={saveRestaurant}
            disabled={saving}
            className="w-full rounded-xl bg-yellow-500 px-6 py-3 font-bold"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {message && <p className="text-center font-semibold">{message}</p>}
        </div>
      </div>
    </main>
  );
}