"use client";

import { useEffect, useState } from "react";
import AdminTopBar from "@/app/admin/components/AdminTopBar";
import { getLocationName } from "@/lib/locationName";

export default function AdminEngagementPage() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const loadEvents = async () => {
      const res = await fetch("/api/admin/engagement");
      const data = await res.json();
      setEvents(data.events || []);
    };

    loadEvents();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white">
      <AdminTopBar />

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-bold">Restaurant Engagement</h1>

        <div className="mt-8 space-y-4">
          {events.map((event) => (
            <div key={event.id} className="rounded-2xl bg-white p-5 text-black">
              <p className="font-bold">{event.event_type}</p>
              <p className="text-sm text-neutral-600">{event.email}</p>
              <p className="text-sm">
                {getLocationName(event.restaurants, "Unknown Restaurant")}
              </p>
              <p className="text-xs text-neutral-500">
                {new Date(event.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}