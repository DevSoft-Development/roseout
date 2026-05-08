"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import AdminTopBar from "@/app/admin/components/AdminTopBar";

export default function AdminInvitesPage() {
  const supabase = createClient();

  const [form, setForm] = useState({
    restaurant_name: "",
    contact_name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
  });

  const [qrCode, setQrCode] = useState("");
  const [qrLink, setQrLink] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const update = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addRestaurant = async () => {
    setMessage("");
    setQrCode("");
    setQrLink("");

    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Could not add restaurant.");
      return;
    }

    setQrCode(data.qrCodeDataUrl);
setQrLink(data.qrLink);
    setQrCode(data.restaurant.qr_code_data_url);
    setQrLink(data.restaurant.claim_url);
    setMessage("Restaurant added and QR code created successfully.");
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

      setLoading(false);
    };

    init();
  }, []);

  if (loading) {
    return <main className="min-h-screen bg-black p-6 text-white">Loading...</main>;
  }

  if (unauthorized) {
    return <main className="min-h-screen bg-black p-6 text-white">Not authorized</main>;
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <AdminTopBar />

      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-4xl font-bold">Manually Add Restaurant</h1>

        <p className="mt-3 text-neutral-400">
          Add a restaurant manually and automatically generate its claim QR code.
        </p>

        <div className="mt-8 space-y-4 rounded-3xl bg-white p-6 text-black">
          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Restaurant Name"
            value={form.restaurant_name}
            onChange={(e) => update("restaurant_name", e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Contact Name"
            value={form.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Restaurant Address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="City"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="State"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Zip Code"
            value={form.zip_code}
            onChange={(e) => update("zip_code", e.target.value)}
          />

          <button
            onClick={addRestaurant}
            disabled={!form.restaurant_name.trim()}
            className="w-full rounded-xl bg-yellow-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Add Restaurant
          </button>

          {message && <p className="text-center font-semibold">{message}</p>}

          {qrCode && (
            <div className="mt-6 text-center">
              <img
                src={qrCode}
                alt="Restaurant QR Code"
                className="mx-auto h-64 w-64"
              />

              <p className="mt-4 break-all text-sm">{qrLink}</p>

              <a href={qrCode} download="theouthaven-restaurant-qr.png">
                <button className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white">
                  Download QR Code
                </button>
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}