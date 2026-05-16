"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getLocationName } from "@/lib/locationName";
import { getPrimaryCategory } from "@/lib/locationFields";
import { getIsClaimed } from "@/lib/locationClaim";

export default function ClaimActivityPage() {
  const params = useParams();
  const token = params.token as string;

  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    message: "",
  });

  useEffect(() => {
    const loadActivity = async () => {
      const res = await fetch(`/api/claim-activity/lookup?token=${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Location claim link not found.");
      } else {
        setActivity(data.activity);
      }

      setLoading(false);
    };

    if (token) loadActivity();
  }, [token]);

  async function submitClaim() {
    setError("");

    if (!form.owner_name || !form.owner_email) {
      setError("Please enter your name and business email.");
      return;
    }

    const res = await fetch("/api/claim-activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        ...form,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Could not submit location claim.");
      return;
    }

    setSubmitted(true);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading location claim...
      </main>
    );
  }

  if (error && !activity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-md rounded-3xl bg-white p-6 text-center text-black">
          <h1 className="text-2xl font-bold">Location Claim Link Not Found</h1>
          <p className="mt-2 text-neutral-600">{error}</p>
        </div>
      </main>
    );
  }

  const isClaimed = getIsClaimed(activity);

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-md rounded-3xl bg-white p-6 text-center text-black">
          <h1 className="text-2xl font-bold">Location Claim Submitted</h1>
          <p className="mt-3 text-neutral-600">
            Thank you. TheOutHaven will review your location claim and contact you
            soon.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-400">
          TheOutHaven
        </p>

        <h1 className="mt-3 text-4xl font-black">
          {isClaimed ? "Claimed" : "Claim This Location"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-white/60">
          Verify ownership or management access to update this TheOutHaven activity
          listing.
        </p>

        <div className="mt-8 rounded-3xl bg-white p-6 text-black">
          <h2 className="text-2xl font-bold">
            {getLocationName(activity, "TheOutHaven Location")}
          </h2>

          <p className="mt-2 text-neutral-600">
            {[activity?.address, activity?.city, activity?.state, activity?.zip_code]
              .filter(Boolean)
              .join(", ")}
          </p>

          {activity && (
            <p className="mt-2 text-sm font-semibold text-neutral-700">
              {getPrimaryCategory(activity)}
            </p>
          )}

          {isClaimed ? (
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              Claimed
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
            <input
              value={form.owner_name}
              onChange={(e) =>
                setForm({ ...form, owner_name: e.target.value })
              }
              placeholder="Your full name"
              className="rounded-2xl border px-4 py-3"
            />

            <input
              value={form.owner_email}
              onChange={(e) =>
                setForm({ ...form, owner_email: e.target.value })
              }
              placeholder="Business email"
              type="email"
              className="rounded-2xl border px-4 py-3"
            />

            <input
              value={form.owner_phone}
              onChange={(e) =>
                setForm({ ...form, owner_phone: e.target.value })
              }
              placeholder="Phone number"
              className="rounded-2xl border px-4 py-3"
            />

            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Optional message"
              className="min-h-28 rounded-2xl border px-4 py-3"
            />

            {error && (
              <div className="rounded-2xl bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submitClaim}
              className="rounded-full bg-red-600 px-6 py-4 font-extrabold text-white hover:bg-red-500"
            >
              Submit Location Claim
            </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}