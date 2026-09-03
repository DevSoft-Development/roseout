"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import ReserveEnterpriseHostView from "@/components/reserve/ReserveEnterpriseHostView";

export default function ReserveEnterpriseHostShell({
  locationId,
}: {
  locationId: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!locationId) return;
    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setRefreshKey((value) => value + 1), 250);
    };
    const channel = supabase
      .channel(`reserve-host-${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location_reservations", filter: `location_id=eq.${locationId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservation_waitlist", filter: `location_id=eq.${locationId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [locationId]);

  return <ReserveEnterpriseHostView key={refreshKey} initialLocationId={locationId} />;
}
