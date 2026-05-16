"use client";

import { useMemo, useState } from "react";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getCuisine, getLocationTags } from "@/lib/locationFields";
import { getLocationScore } from "@/lib/locationScore";

type Restaurant = {
  id: string;
  name?: string | null;
  restaurant_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  status: string;

  phone?: string | null;
  website?: string | null;
  external_reservation_url?: string | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  reservation_enabled?: boolean | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  food_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[] | null;
  google_types?: string[] | null;
  description?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  theouthaven_score?: number | null;
  roseout_score?: number | null;
  quality_score?: number | null;
  trend_score?: number | null;
  conversion_score?: number | null;
  review_score?: number | null;
  popularity_score?: number | null;
  ranking_badge?: string | null;
  view_count?: number | null;
  click_count?: number | null;
  created_at?: string | null;
};

type RestaurantForm = Partial<Restaurant>;

type Props = {
  initialRestaurants: Restaurant[];
};

export default function RestaurantsAdminClient({
  initialRestaurants,
}: Props) {
  const [restaurants, setRestaurants] =
    useState<Restaurant[]>(initialRestaurants);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RestaurantForm>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function startEditing(restaurant: Restaurant) {
    setEditingId(restaurant.id);
    setMessage("");

    setForm({
      restaurant_name: restaurant.restaurant_name,
      address: restaurant.address,
      city: restaurant.city,
      state: restaurant.state,
      zip_code: restaurant.zip_code,
      status: restaurant.status,
      phone: restaurant.phone ?? "",
      website: restaurant.website ?? "",
      reservation_url: restaurant.reservation_url ?? "",
      cuisine: restaurant.cuisine ?? "",
      description: restaurant.description ?? "",
      image_url: restaurant.image_url ?? "",
      theouthaven_score: restaurant.theouthaven_score ?? 0,
      view_count: restaurant.view_count ?? 0,
      click_count: restaurant.click_count ?? 0,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm({});
    setMessage("");
  }

  function updateForm(field: keyof Restaurant, value: string | number) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveRestaurant(id: string) {
    try {
      setSaving(true);
      setMessage("");

      const payload = {
        restaurant_name: form.restaurant_name ?? "",
        address: form.address ?? "",
        city: form.city ?? "",
        state: form.state ?? "",
        zip_code: form.zip_code ?? "",
        status: form.status ?? "pending",
        phone: form.phone ?? null,
        website: form.website ?? null,
        reservation_url: form.reservation_url ?? null,
        cuisine: form.cuisine ?? null,
        description: form.description ?? null,
        image_url: form.image_url ?? null,
        theouthaven_score:
          form.theouthaven_score === undefined || form.theouthaven_score === null
            ? null
            : Number(form.theouthaven_score),
      };

      const res = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update restaurant");
      }

      setRestaurants((prev): Restaurant[] =>
        prev.map((r): Restaurant =>
          r.id === id
            ? {
                ...r,
                restaurant_name: form.restaurant_name ?? r.restaurant_name,
                address: form.address ?? r.address,
                city: form.city ?? r.city,
                state: form.state ?? r.state,
                zip_code: form.zip_code ?? r.zip_code,
                status: form.status ?? r.status,
                phone: form.phone ?? r.phone,
                website: form.website ?? r.website,
                reservation_url: form.reservation_url ?? r.reservation_url,
                cuisine: form.cuisine ?? r.cuisine,
                description: form.description ?? r.description,
                image_url: form.image_url ?? r.image_url,
                theouthaven_score:
                  form.theouthaven_score === undefined
                    ? r.theouthaven_score
                    : Number(form.theouthaven_score),
                view_count: r.view_count,
                click_count: r.click_count,
              }
            : r
        )
      );

      setEditingId(null);
      setForm({});
      setMessage("Restaurant updated successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Update failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((restaurant) => {
      const q = search.toLowerCase();

      const matchesSearch =
        getLocationName(restaurant, "").toLowerCase().includes(q) ||
        restaurant.address.toLowerCase().includes(q) ||
        restaurant.city.toLowerCase().includes(q) ||
        restaurant.state.toLowerCase().includes(q) ||
        getLocationTags(restaurant).some((tag) => tag.includes(q));

      const matchesStatus =
        statusFilter === "all" || restaurant.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [restaurants, search, statusFilter]);

  return (
    <main className="min-h-screen bg-[#fff8f1] px-6 py-8 text-[#2b1a12]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b66a3c]">
            TheOutHaven Admin
          </p>
          <h1 className="mt-2 text-4xl font-bold">Restaurants CMS</h1>
          <p className="mt-2 text-sm text-[#6f5c50]">
            Manage restaurant listings, details, images, reservation links, and
            TheOutHaven scores.
          </p>
        </div>

        <div className="mb-6 grid gap-4 rounded-3xl border border-[#ead8c7] bg-white p-5 shadow-sm md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants..."
            className="rounded-2xl border border-[#ead8c7] px-4 py-3 text-sm outline-none focus:border-[#b66a3c]"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-[#ead8c7] px-4 py-3 text-sm outline-none focus:border-[#b66a3c]"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="draft">Draft</option>
          </select>

          <div className="flex items-center rounded-2xl bg-[#fff8f1] px-4 py-3 text-sm font-semibold text-[#6f5c50]">
            {filteredRestaurants.length} restaurants found
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl border border-[#ead8c7] bg-white px-5 py-4 text-sm font-semibold text-[#6f5c50]">
            {message}
          </div>
        )}

        <div className="grid gap-5">
          {filteredRestaurants.map((restaurant) => {
            const isEditing = editingId === restaurant.id;

            return (
              <section
                key={restaurant.id}
                className="rounded-3xl border border-[#ead8c7] bg-white p-5 shadow-sm"
              >
                {!isEditing ? (
                  <div className="grid gap-5 lg:grid-cols-[140px_1fr_auto]">
                    <div className="h-32 w-full overflow-hidden rounded-2xl bg-[#f4e5d8] lg:w-32">
                      {getLocationImage(restaurant) ? (
                        <img
                          src={getLocationImage(restaurant)}
                          alt={getLocationName(restaurant, "Restaurant")}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[#8a7568]">
                          No Image
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-bold">
                          {getLocationName(restaurant, "Restaurant")}
                        </h2>

                        <span className="rounded-full bg-[#fff0e3] px-3 py-1 text-xs font-semibold capitalize text-[#b66a3c]">
                          {restaurant.status}
                        </span>
                      </div>

                      <p className="text-sm text-[#6f5c50]">
                        {restaurant.address}, {restaurant.city},{" "}
                        {restaurant.state} {restaurant.zip_code}
                      </p>

                      <p className="mt-2 text-sm text-[#6f5c50]">
                        {getCuisine(restaurant) || "No cuisine listed"}
                      </p>

                      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6f5c50]">
                        {restaurant.description || "No description added."}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-[#6f5c50]">
                        <span>Score: {getLocationScore(restaurant)}</span>
                        <span>Views: {restaurant.view_count ?? 0}</span>
                        <span>Clicks: {restaurant.click_count ?? 0}</span>
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => startEditing(restaurant)}
                        className="rounded-full bg-[#2b1a12] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-2xl font-bold">Edit Restaurant</h2>

                      <div className="flex gap-2">
                        <button
                          onClick={cancelEditing}
                          className="rounded-full border border-[#ead8c7] px-5 py-3 text-sm font-semibold"
                        >
                          Cancel
                        </button>

                        <button
                          onClick={() => saveRestaurant(restaurant.id)}
                          disabled={saving}
                          className="rounded-full bg-[#b66a3c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Restaurant Name"
                        value={form.restaurant_name ?? ""}
                        onChange={(value) =>
                          updateForm("restaurant_name", value)
                        }
                      />

                      <Input
                        label="Cuisine"
                        value={form.cuisine ?? ""}
                        onChange={(value) => updateForm("cuisine", value)}
                      />

                      <Input
                        label="Address"
                        value={form.address ?? ""}
                        onChange={(value) => updateForm("address", value)}
                      />

                      <Input
                        label="City"
                        value={form.city ?? ""}
                        onChange={(value) => updateForm("city", value)}
                      />

                      <Input
                        label="State"
                        value={form.state ?? ""}
                        onChange={(value) => updateForm("state", value)}
                      />

                      <Input
                        label="Zip Code"
                        value={form.zip_code ?? ""}
                        onChange={(value) => updateForm("zip_code", value)}
                      />

                      <Input
                        label="Phone"
                        value={form.phone ?? ""}
                        onChange={(value) => updateForm("phone", value)}
                      />

                      <Input
                        label="Website"
                        value={form.website ?? ""}
                        onChange={(value) => updateForm("website", value)}
                      />

                      <Input
                        label="Reservation Link"
                        value={form.reservation_url ?? ""}
                        onChange={(value) =>
                          updateForm("reservation_url", value)
                        }
                      />

                      <Input
                        label="Image URL"
                        value={form.image_url ?? ""}
                        onChange={(value) => updateForm("image_url", value)}
                      />

                      <Input
                        label="TheOutHaven Score"
                        type="number"
                        value={String(form.theouthaven_score ?? 0)}
                        onChange={(value) =>
                          updateForm("theouthaven_score", Number(value))
                        }
                      />

                      <div>
                        <label className="mb-2 block text-sm font-semibold">
                          Status
                        </label>
                        <select
                          value={form.status ?? "pending"}
                          onChange={(e) =>
                            updateForm("status", e.target.value)
                          }
                          className="w-full rounded-2xl border border-[#ead8c7] px-4 py-3 text-sm outline-none focus:border-[#b66a3c]"
                        >
                          <option value="approved">Approved</option>
                          <option value="pending">Pending</option>
                          <option value="rejected">Rejected</option>
                          <option value="draft">Draft</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">
                        Description
                      </label>
                      <textarea
                        value={form.description ?? ""}
                        onChange={(e) =>
                          updateForm("description", e.target.value)
                        }
                        rows={5}
                        className="w-full rounded-2xl border border-[#ead8c7] px-4 py-3 text-sm outline-none focus:border-[#b66a3c]"
                      />
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {filteredRestaurants.length === 0 && (
            <div className="rounded-3xl border border-[#ead8c7] bg-white p-8 text-center text-sm text-[#6f5c50] shadow-sm">
              No restaurants found.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-[#ead8c7] px-4 py-3 text-sm outline-none focus:border-[#b66a3c]"
      />
    </div>
  );
}