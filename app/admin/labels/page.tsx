"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import AdminTopBar from "@/app/admin/components/AdminTopBar";
import { getLocationName } from "@/lib/locationName";

export default function AdminLabelsPage() {
  const supabase = createClient();

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const loadRestaurants = async () => {
    const res = await fetch("/api/admin/restaurants");
    const data = await res.json();
    setRestaurants(data.restaurants || []);
  };

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        window.location.href = "/login";
        return;
      }

      if (data.user.user_metadata?.role !== "superuser") {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      await loadRestaurants();
      setLoading(false);
    };

    init();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const selectedRestaurants = restaurants.filter((r) =>
    selectedIds.includes(r.id)
  );

  const printLabels = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const labelsHtml = selectedRestaurants
  .map(
    (r) => `
      <div class="label">
        <div class="qr-section">
          <img src="${r.qr_code_data_url || ""}" />
          <p class="scan-text">Scan to claim & manage</p>
        </div>

        <div class="text">
          <h2>${getLocationName(r, "")}</h2>

          <p class="address">
            ${r.address || ""}
          </p>

          <p class="address">
            ${r.city || ""}, ${r.state || ""} ${r.zip_code || ""}
          </p>

          <p class="brand">Powered by TheOutHaven</p>
        </div>
      </div>
    `
  )
  .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>TheOutHaven Restaurant Labels</title>
          <style>
            <style>
  body {
    font-family: Arial, sans-serif;
    padding: 20px;
  }

  .sheet {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 18px;
  }

  .label {
    display: flex;
    gap: 16px;
    border: 1px solid #ddd;
    border-radius: 14px;
    padding: 16px;
    min-height: 150px;
    align-items: center;
    background: white;
  }

  .qr-section {
    text-align: center;
  }

  img {
    width: 110px;
    height: 110px;
  }

  .scan-text {
    margin-top: 6px;
    font-size: 10px;
    font-weight: bold;
  }

  .text {
    flex: 1;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }

  .address {
    margin: 2px 0;
    font-size: 13px;
  }

  .brand {
    margin-top: 10px;
    font-size: 11px;
    font-weight: bold;
    color: #888;
  }

  @media print {
    body {
      padding: 0;
    }

    .label {
      page-break-inside: avoid;
    }
  }
</style>
          </style>
        </head>
        <body>
          <div class="sheet">${labelsHtml}</div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  if (loading) {
    return <main className="min-h-screen bg-black p-6 text-white">Loading...</main>;
  }

  if (unauthorized) {
    return <main className="min-h-screen bg-black p-6 text-white">Not authorized</main>;
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <AdminTopBar />

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-bold">Bulk Print Labels</h1>

        <p className="mt-3 text-neutral-400">
          Select restaurants and print QR labels in bulk.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setSelectedIds(restaurants.map((r) => r.id))}
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black"
          >
            Select All
          </button>

          <button
            onClick={() => setSelectedIds([])}
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black"
          >
            Clear
          </button>

          <button
            onClick={printLabels}
            disabled={selectedIds.length === 0}
            className="rounded-xl bg-yellow-500 px-4 py-2 font-bold text-black disabled:opacity-50"
          >
            Print Selected Labels
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {restaurants.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-4 text-black"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(r.id)}
                onChange={() => toggleSelect(r.id)}
              />

              {r.qr_code_data_url && (
                <img
                  src={r.qr_code_data_url}
                  alt={`${getLocationName(r, "Restaurant")} QR`}
                  className="h-20 w-20"
                />
              )}

              <div>
                <h2 className="font-bold">{getLocationName(r, "Restaurant")}</h2>
                <p className="text-sm text-neutral-600">
                  {r.address}, {r.city}, {r.state} {r.zip_code}
                </p>
                <p className="text-xs text-neutral-500">
                  Status: {r.status}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </main>
  );
}