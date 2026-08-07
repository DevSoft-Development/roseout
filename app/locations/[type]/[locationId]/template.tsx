"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getInternalReservationHref } from "@/lib/reservation";

type ReservationProfileLocation = {
  id?: string | null;
  slug?: string | null;
  location_type?: string | null;
  reservation_enabled?: boolean | null;
  internal_reservations_enabled?: boolean | null;
  uses_internal_reservations?: boolean | null;
  reservation_source?: string | null;
  is_hidden?: boolean | null;
  is_searchable?: boolean | null;
  demo_key?: string | null;
  metadata?: Record<string, unknown> | null;
};

export default function LocationProfileTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <InternalReservationProfileCta />
    </>
  );
}

function InternalReservationProfileCta() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [href, setHref] = useState("");

  const routeLocationId = String(params.locationId || "");
  const routeType = String(params.type || "restaurant");
  const pathSegments = pathname.split("/").filter(Boolean);
  const isProfilePage =
    pathSegments.length === 3 && pathSegments[0] === "locations";

  useEffect(() => {
    let cancelled = false;

    async function loadReservationCta() {
      if (!routeLocationId || !isProfilePage) {
        setHref("");
        return;
      }

      let { data, error } = await supabase
        .from("locations")
        .select(
          "id,slug,location_type,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_source,is_hidden,is_searchable,demo_key,metadata",
        )
        .eq("id", routeLocationId)
        .maybeSingle();

      if (!data && !error) {
        const slugResult = await supabase
          .from("locations")
          .select(
            "id,slug,location_type,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_source,is_hidden,is_searchable,demo_key,metadata",
          )
          .eq("slug", routeLocationId)
          .maybeSingle();
        data = slugResult.data;
        error = slugResult.error;
      }

      if (cancelled || error || !data?.id) {
        setHref("");
        return;
      }

      const location = data as ReservationProfileLocation;
      const source = String(location.reservation_source || "external").toLowerCase();
      const hasInternalReservations = Boolean(
        location.reservation_enabled ||
          location.internal_reservations_enabled ||
          location.uses_internal_reservations,
      );

      const demoPreview =
        searchParams.get("demo") === "1" &&
        searchParams.get("fromDemoCenter") === "1" &&
        (searchParams.get("adminLocationId") === String(location.id) ||
          searchParams.get("locationId") === String(location.id));
      const demoTagged =
        location.demo_key === "real_location_mirror_demo" ||
        location.metadata?.demo_key === "real_location_mirror_demo";
      const ordinaryPublicLocation =
        location.is_hidden !== true && location.is_searchable !== false;

      if (
        !(ordinaryPublicLocation || (demoPreview && demoTagged)) ||
        !hasInternalReservations ||
        (source !== "internal" && source !== "both")
      ) {
        setHref("");
        return;
      }

      setHref(
        getInternalReservationHref(
          {
            id: String(location.id),
            location_type: location.location_type || routeType,
          },
          routeType === "activity" || routeType === "activities"
            ? "activity"
            : "restaurant",
        ) || "",
      );
    }

    void loadReservationCta();
    return () => {
      cancelled = true;
    };
  }, [isProfilePage, routeLocationId, routeType, searchParams, supabase]);

  if (!href || !isProfilePage) return null;

  return (
    <aside className="fixed bottom-24 right-4 z-[60] w-[min(92vw,340px)] rounded-[1.35rem] border border-red-400/25 bg-black/90 p-3 shadow-2xl shadow-red-950/40 backdrop-blur-xl md:bottom-6 md:right-6">
      <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-red-300">
        Reservations powered by TheOutHaven
      </p>
      <Link
        href={href}
        className="mt-2 flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/25"
      >
        Reserve on TheOutHaven
      </Link>
    </aside>
  );
}
