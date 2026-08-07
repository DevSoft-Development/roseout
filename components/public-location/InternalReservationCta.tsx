"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ReservationCtaState = {
  enabled: boolean;
  href?: string;
  label?: string;
};

export default function InternalReservationCta({
  locationId,
}: {
  locationId?: string | null;
}) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ReservationCtaState>({ enabled: false });

  const routeType = String(params.type || "restaurant");
  const routeLocationId = String(params.locationId || "");
  const resolvedLocationId = String(locationId || routeLocationId || "").trim();

  const isExactProfileRoute = useMemo(() => {
    const expected = `/locations/${routeType}/${routeLocationId}`;
    return Boolean(routeLocationId && pathname === expected);
  }, [pathname, routeLocationId, routeType]);

  useEffect(() => {
    let cancelled = false;

    async function loadCta() {
      if (!isExactProfileRoute || !resolvedLocationId) {
        setState({ enabled: false });
        return;
      }

      const query = new URLSearchParams({
        locationId: resolvedLocationId,
        type: routeType,
      });

      for (const key of ["demo", "fromDemoCenter", "adminLocationId"]) {
        const value = searchParams.get(key);
        if (value) query.set(key, value);
      }

      try {
        const response = await fetch(`/api/reserve/profile-cta?${query.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as ReservationCtaState;

        if (cancelled || !response.ok || !payload.enabled || !payload.href) {
          setState({ enabled: false });
          return;
        }

        setState(payload);
      } catch {
        if (!cancelled) setState({ enabled: false });
      }
    }

    void loadCta();
    return () => {
      cancelled = true;
    };
  }, [isExactProfileRoute, resolvedLocationId, routeType, searchParams]);

  if (!state.enabled || !state.href) return null;

  return (
    <div className="mt-4 rounded-[1.15rem] border border-red-400/20 bg-red-600/10 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200/80">
        Reservations powered by TheOutHaven
      </p>
      <Link
        href={state.href}
        className="mt-2 flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/25"
      >
        {state.label || "Reserve on TheOutHaven"}
      </Link>
    </div>
  );
}
