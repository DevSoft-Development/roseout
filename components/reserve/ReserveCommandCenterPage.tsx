"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Plus,
  QrCode,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import AdminActingAsLocationBanner from "@/components/admin/AdminActingAsLocationBanner";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import ReserveCommandCenterShell from "@/components/reserve/ReserveCommandCenterShell";
import ReserveMetricCard from "@/components/reserve/ReserveMetricCard";
import ReserveTimeline from "@/components/reserve/ReserveTimeline";
import ReserveFloorSnapshot from "@/components/reserve/ReserveFloorSnapshot";
import ReserveGuestDetails from "@/components/reserve/ReserveGuestDetails";
import ReserveWaitlistPanel from "@/components/reserve/ReserveWaitlistPanel";
import ReserveHumanMessage from "@/components/reserve/ReserveHumanMessage";
import ReserveEmptyState from "@/components/reserve/ReserveEmptyState";
import {
  getReservationGuestName,
  getReservationStatusLabel,
} from "@/lib/reservations/ui";
import { formatShortDate } from "@/lib/reservations/reservationFormatting";
import { API_ROUTES } from "@/lib/routes";
import {
  getReserveActionLinks,
  getReserveDashboardUrl,
} from "@/lib/reservations/reserveLinks";
import {
  getFloorSnapshotState,
  hasAssignedReservationResource,
  resourceAssignmentPayload,
  resourceCapacity,
  resourceId,
  resourceName,
} from "@/lib/reservations/floorSnapshot";
import { getReserveVocabulary } from "@/lib/reservations/reserveVocabulary";
import { reservationNeedsAction } from "@/lib/reservations/metrics";
import {
  clampReservationDate,
  generateQuarterHourOptions,
  getNextFutureQuarterTime,
  getTodayLocalDate,
  normalizeReservationFormDateTime,
} from "@/lib/reservations/timeSlots";

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "waiting"
  | "arrived"
  | "seated"
  | "waitlisted"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

type Reservation = Record<string, any> & {
  id: string;
  status: ReservationStatus;
  reservation_date: string;
  reservation_time: string;
  customer_name?: string;
  party_size?: number;
  location_id: string;
  location_type: string;
};

const statusTabs = [
  "all",
  "pending",
  "confirmed",
  "checked_in",
  "seated",
  "completed",
  "cancelled",
  "no_show",
];

const validTabs = new Set(["today", "calendar", "floor", "guests", "waitlist"]);

function todayKey(date = new Date()) {
  return getTodayLocalDate("America/New_York");
}

function normalizeType(value: string | null | undefined) {
  const type = String(value || "").toLowerCase();
  if (!type) return "";
  return type === "activities" ? "activity" : type;
}

function addDays(dateKeyValue: string, amount: number) {
  const date = new Date(`${dateKeyValue}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return todayKey(date);
}

function friendlyError(
  value: unknown,
  fallback = "We could not load this reservation view.",
) {
  return value instanceof Error ? value.message : fallback;
}

export default function ReserveCommandCenterPage() {
  return (
    <Suspense
      fallback={
        <main className="reserve-command-center min-h-screen p-10 text-sm font-bold reserve-muted">
          Loading reservations…
        </main>
      }
    >
      <ReserveCommandCenterContent />
    </Suspense>
  );
}

function ReserveCommandCenterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [persistedAdminLocationId, setPersistedAdminLocationId] = useState("");
  const adminLocationId =
    searchParams.get("adminLocationId") || persistedAdminLocationId;
  const locationId = adminLocationId || searchParams.get("locationId") || "";
  const suppliedLocationType = normalizeType(searchParams.get("type"));
  const requestedTab = searchParams.get("tab") || "today";

  const [activeTab, setActiveTab] = useState(
    validTabs.has(requestedTab) ? requestedTab : "today",
  );
  const [selectedDate, setSelectedDate] = useState(
    searchParams.get("date") || getTodayLocalDate("America/New_York"),
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all",
  );
  const [search, setSearch] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "warning" | "info";
    text: string;
  } | null>(null);
  const [adminSummary, setAdminSummary] = useState<any>(null);
  const [modal, setModal] = useState<
    "reservation" | "walkin" | "waitlist" | null
  >(null);
  const [createDate, setCreateDate] = useState(
    getTodayLocalDate("America/New_York"),
  );
  const [createTime, setCreateTime] = useState(
    getNextFutureQuarterTime("America/New_York"),
  );
  const [assigningReservationId, setAssigningReservationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loadInFlight = useRef(false);

  const loadedLocationType = normalizeType(
    adminSummary?.location?.location_type ||
      adminSummary?.location?.source_table ||
      adminSummary?.location?.type,
  );
  const locationType = suppliedLocationType || loadedLocationType || "location";
  const vocab = getReserveVocabulary(
    locationType,
    resources[0]?.item_type || resources[0]?.type,
  );

  function dashboardHref(tab = activeTab) {
    return getReserveDashboardUrl(tab, undefined, {
      adminLocationId: adminLocationId || undefined,
      locationId: !adminLocationId ? locationId : undefined,
      type: suppliedLocationType || loadedLocationType || undefined,
      date: selectedDate,
      demo: searchParams.get("demo") || undefined,
      fromDemoCenter: searchParams.get("fromDemoCenter") || undefined,
    });
  }

  function settingsHref(section?: string) {
    return getReserveDashboardUrl("settings", section, {
      adminLocationId: adminLocationId || undefined,
      locationId: !adminLocationId ? locationId : undefined,
      type: suppliedLocationType || loadedLocationType || undefined,
      demo: searchParams.get("demo") || undefined,
      fromDemoCenter: searchParams.get("fromDemoCenter") || undefined,
    });
  }

  function actionContext() {
    return {
      adminLocationId: adminLocationId || undefined,
      type: suppliedLocationType || loadedLocationType || undefined,
    };
  }

  const isDemoLocation = Boolean(
    adminSummary?.location?.is_demo ||
      adminSummary?.location?.demo_key ||
      searchParams.get("demo") === "1",
  );

  const actionLinks = getReserveActionLinks({
    locationId,
    locationType,
    adminLocationId: adminLocationId || undefined,
    isDemo: isDemoLocation,
  });

  function switchTab(tab: string) {
    const nextTab = validTabs.has(tab) ? tab : "today";
    setActiveTab(nextTab);
    router.replace(dashboardHref(nextTab), { scroll: false });
  }

  async function loadAll(
    options: { silent?: boolean; date?: string; force?: boolean } = {},
  ) {
    if (loadInFlight.current && !options.force) return;
    loadInFlight.current = true;
    if (!options.silent) setLoading(true);
    if (!options.silent) setMessage(null);

    try {
      const loadDate = options.date || selectedDate;
      const params = new URLSearchParams({ filter: "date", date: loadDate });
      if (locationId) {
        params.set("locationId", locationId);
        if (suppliedLocationType || loadedLocationType) {
          params.set("type", locationType);
        }
        if (adminLocationId) params.set("adminLocationId", adminLocationId);
      }

      const response = await fetch(
        `${API_ROUTES.reservePortalReservations}?${params}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not load reservations.");
      }
      setReservations((data.reservations || []) as Reservation[]);

      if (locationId) {
        const extraParams = new URLSearchParams({
          locationId,
          date: loadDate,
        });
        if (adminLocationId) {
          extraParams.set("adminLocationId", adminLocationId);
        }
        const [resourceResponse, waitlistResponse] = await Promise.allSettled([
          fetch(`${API_ROUTES.reservePortalResources}?${extraParams}`),
          fetch(`${API_ROUTES.reservePortalWaitlist}?${extraParams}`),
        ]);

        if (resourceResponse.status === "fulfilled") {
          const payload = await resourceResponse.value.json();
          setResources(resourceResponse.value.ok ? payload.resources || [] : []);
        }
        if (waitlistResponse.status === "fulfilled") {
          const payload = await waitlistResponse.value.json();
          setWaitlist(waitlistResponse.value.ok ? payload.waitlist || [] : []);
        }
      }

      setLastUpdated(new Date());
    } catch (error) {
      if (!options.silent) {
        setMessage({ tone: "error", text: friendlyError(error) });
      }
    } finally {
      loadInFlight.current = false;
      if (!options.silent) setLoading(false);
    }
  }

  async function updateStatus(reservation: Reservation, status: string) {
    if (status === "seated" && !hasAssignedReservationResource(reservation)) {
      setSelectedId(reservation.id);
      setAssigningReservationId(reservation.id);
      setMessage({
        tone: "warning",
        text: resources.length
          ? `${vocab.chooseResource} before continuing.`
          : `Add your ${vocab.resourcePlural.toLowerCase()} in Layout & Spaces before seating this guest.`,
      });
      return;
    }

    if (
      ["cancelled", "no_show", "declined"].includes(status) &&
      !window.confirm(
        `Mark this reservation as ${getReservationStatusLabel(status, vocab)}?`,
      )
    ) {
      return;
    }

    setUpdatingId(reservation.id);
    setMessage(null);
    try {
      const response = await fetch(API_ROUTES.reservePortalReservationUpdate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          status,
          adminLocationId: adminLocationId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "We could not update this reservation. Please try again.",
        );
      }
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id ? data.reservation : item,
        ),
      );
      setSelectedId(reservation.id);
      setMessage({
        tone: "success",
        text:
          status === "confirmed"
            ? "Reservation confirmed."
            : ["checked_in", "waiting", "arrived"].includes(status)
              ? "Guest checked in and waiting."
              : status === "seated"
                ? `${vocab.customer} ${vocab.seatedStatus.toLowerCase()}.`
                : status === "completed"
                  ? "Reservation completed."
                  : `Reservation marked ${getReservationStatusLabel(status, vocab)}.`,
      });
      await loadAll({ silent: true });
    } catch (error) {
      const fallback =
        status === "seated"
          ? "We could not seat this guest. Please try again."
          : `This reservation cannot move from ${getReservationStatusLabel(
              reservation.status,
              vocab,
            )} to ${getReservationStatusLabel(status, vocab)}.`;
      setMessage({
        tone: "error",
        text:
          status === "seated" &&
          error instanceof Error &&
          error.message.includes("requested status")
            ? "Check the guest in before seating them."
            : friendlyError(error, fallback),
      });
    } finally {
      setUpdatingId("");
    }
  }

  async function assignResource(reservation: Reservation, resource: any) {
    const state = getFloorSnapshotState(resource, dayReservations);
    if (!reservation?.id) return;
    if (!resourceId(resource) && !resourceName(resource)) {
      setMessage({
        tone: "error",
        text: `Choose a valid ${vocab.resource.toLowerCase()}.`,
      });
      return;
    }
    if (!state.available) {
      setMessage({
        tone: "error",
        text: `That ${vocab.resource.toLowerCase()} is not available for this reservation time.`,
      });
      return;
    }

    setUpdatingId(reservation.id);
    setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/assign-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          ...resourceAssignmentPayload(resource),
          seat_after_assign: true,
          adminLocationId: adminLocationId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (process.env.NODE_ENV !== "production" && data?.debugId) {
          console.error("Reservation seating error", data);
        }
        throw new Error(
          data.error ||
            `We could not assign that ${vocab.resource.toLowerCase()}. Please choose another one.`,
        );
      }
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id ? data.reservation : item,
        ),
      );
      setSelectedId(reservation.id);
      setAssigningReservationId("");
      setMessage({
        tone: "success",
        text: `${vocab.resource} assigned. ${vocab.customer} ${vocab.seatedStatus.toLowerCase()}.`,
      });
      await loadAll({ silent: true });
    } catch (error) {
      setMessage({
        tone: "error",
        text: friendlyError(
          error,
          `We could not assign that ${vocab.resource.toLowerCase()}. Please choose another one.`,
        ),
      });
    } finally {
      setUpdatingId("");
    }
  }

  async function sendTableReady(reservation: Reservation) {
    if (!hasAssignedReservationResource(reservation)) {
      setSelectedId(reservation.id);
      setAssigningReservationId(reservation.id);
      setMessage({
        tone: "warning",
        text: `${vocab.chooseResource} before sending the ready message.`,
      });
      return;
    }
    if (!reservation.customer_phone) {
      setMessage({
        tone: "warning",
        text: "Add a phone number before sending a ready text message.",
      });
      return;
    }

    setUpdatingId(reservation.id);
    setMessage(null);
    try {
      const response = await fetch(
        `${API_ROUTES.reservePortalReservations}/table-ready`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservation_id: reservation.id,
            location_id: reservation.location_id,
            adminLocationId: adminLocationId || undefined,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not send the ready message.");
      }
      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id
            ? {
                ...item,
                table_ready_sms_sent: true,
                table_ready_sms_sent_at:
                  data.sms?.sent_at || data.sms?.created_at || new Date().toISOString(),
                table_ready_sms_status: data.sms?.status || "sent",
              }
            : item,
        ),
      );
      setSelectedId(reservation.id);
      setMessage({
        tone: "success",
        text: `Ready text sent to ${getReservationGuestName(reservation)}.`,
      });
      await loadAll({ silent: true });
    } catch (error) {
      setMessage({
        tone: "error",
        text: friendlyError(error, "We could not send the ready message."),
      });
    } finally {
      setUpdatingId("");
    }
  }

  async function notifyWaitlist(entry: any) {
    setUpdatingId(entry.id);
    setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "notify_waitlist",
          waitlist_id: entry.id,
          location_id: locationId,
          location_type: locationType,
          adminLocationId: adminLocationId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not update this waitlist guest.");
      }
      if (data.reservation) {
        setReservations((current) => [
          data.reservation,
          ...current.filter((item) => item.id !== data.reservation.id),
        ]);
        setSelectedId(data.reservation.id);
        switchTab("today");
      }
      setWaitlist((current) =>
        data.waitlist?.status === "booked"
          ? current.filter((item) => item.id !== entry.id)
          : current.map((item) => (item.id === entry.id ? data.waitlist : item)),
      );
      setMessage({
        tone: "success",
        text: data.reservation
          ? "Reservation created for this guest."
          : "Availability offer sent to the guest.",
      });
      await loadAll({ silent: true });
      if (data.reservation) setSelectedId(data.reservation.id);
    } catch (error) {
      setMessage({
        tone: "error",
        text: friendlyError(error, "We could not update this waitlist guest."),
      });
    } finally {
      setUpdatingId("");
    }
  }

  async function submitCreate(
    event: FormEvent<HTMLFormElement>,
    kind: "reservation" | "walkin" | "waitlist",
  ) {
    event.preventDefault();
    if (!locationId) {
      setMessage({
        tone: "warning",
        text: "Choose a location before adding a reservation.",
      });
      return;
    }

    const form = new FormData(event.currentTarget);
    const guestName = String(form.get("guestName") || "").trim();
    const partySize = Math.max(Number(form.get("partySize") || 2), 1);
    const normalizedDateTime = normalizeReservationFormDateTime({
      reservationDate: String(form.get("date") || createDate),
      reservationTime: String(
        form.get("time") ||
          createTime ||
          getNextFutureQuarterTime("America/New_York"),
      ),
      timeZone: "America/New_York",
    });
    const reservationDate = normalizedDateTime.reservationDate;
    const reservationTime = normalizedDateTime.reservationTime;
    const notes = String(form.get("notes") || "").trim();

    setSubmitting(true);
    setMessage(null);
    try {
      if (kind === "waitlist") {
        const response = await fetch(API_ROUTES.reservePortalWaitlist, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: locationId,
            reservation_date: reservationDate,
            reservation_time: reservationTime,
            party_size: partySize,
            contact_name: guestName,
            contact_email: String(form.get("email") || ""),
            contact_phone: String(form.get("phone") || ""),
            notes,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "We could not add this guest to the waitlist.");
        }
        setMessage({ tone: "success", text: "Guest added to waitlist." });
      } else {
        const response = await fetch(API_ROUTES.reservePortalReservations, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: locationId,
            location_type: locationType,
            customer_name:
              kind === "walkin" ? guestName || "Walk-in Guest" : guestName,
            customer_email: String(form.get("email") || ""),
            customer_phone: String(form.get("phone") || ""),
            party_size: partySize,
            reservation_date: reservationDate,
            reservation_time: reservationTime,
            duration_minutes: Number(form.get("duration") || 90),
            special_request: notes,
            source: kind === "walkin" ? "walk_in" : "owner_dashboard",
            status: kind === "walkin" ? "checked_in" : "confirmed",
            adminLocationId: adminLocationId || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "We could not create this reservation.");
        }
        setSelectedId(data.reservation?.id || "");
        setMessage({
          tone: "success",
          text: kind === "walkin" ? "Walk-in added." : "Reservation created.",
        });
      }
      setSelectedDate(reservationDate);
      setModal(null);
      await loadAll({ date: reservationDate, force: true });
    } catch (error) {
      setMessage({
        tone: "error",
        text: friendlyError(
          error,
          kind === "waitlist"
            ? "We could not add this guest to the waitlist."
            : "We could not create this reservation.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const nextTab = searchParams.get("tab") || "today";
    setActiveTab(validTabs.has(nextTab) ? nextTab : "today");
    const nextDate = searchParams.get("date");
    if (nextDate) {
      setSelectedDate(clampReservationDate(nextDate, "America/New_York"));
    }
    const nextStatus = searchParams.get("status");
    if (nextStatus) setStatusFilter(nextStatus);
  }, [searchParams]);

  useEffect(() => {
    if (!modal) return;
    const date = clampReservationDate(selectedDate, "America/New_York");
    setCreateDate(date);
    const options = generateQuarterHourOptions({
      selectedDate: date,
      timeZone: "America/New_York",
    });
    setCreateTime((current) =>
      options.some((option) => option.value === current)
        ? current
        : options[0]?.value || getNextFutureQuarterTime("America/New_York"),
    );
  }, [modal, selectedDate]);

  useEffect(() => {
    const fromQuery = searchParams.get("adminLocationId") || "";
    if (fromQuery) {
      window.sessionStorage.setItem("reserveAdminLocationId", fromQuery);
      setPersistedAdminLocationId(fromQuery);
      return;
    }
    setPersistedAdminLocationId(
      window.sessionStorage.getItem("reserveAdminLocationId") || "",
    );
  }, [searchParams]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, locationType, adminLocationId, selectedDate]);

  useEffect(() => {
    if (!adminLocationId) return;
    fetch(`/api/admin/locations/${adminLocationId}/summary`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok) setAdminSummary(data);
      });
  }, [adminLocationId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const typing = ["input", "textarea", "select"].includes(tag || "");
      if (modal || submitting || updatingId || assigningReservationId || typing) {
        return;
      }
      void loadAll({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    locationId,
    locationType,
    adminLocationId,
    selectedDate,
    modal,
    submitting,
    updatingId,
    assigningReservationId,
  ]);

  const dayReservations = reservations.filter(
    (reservation) => reservation.reservation_date === selectedDate,
  );
  const filtered = dayReservations.filter((reservation) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "needs_action"
        ? reservationNeedsAction(reservation)
        : reservation.status === statusFilter);
    const haystack = `${getReservationGuestName(reservation)} ${
      reservation.customer_phone || ""
    } ${reservation.customer_email || ""} ${reservation.special_request || ""}`;
    return matchesStatus && haystack.toLowerCase().includes(search.toLowerCase());
  });
  const selected =
    dayReservations.find((reservation) => reservation.id === selectedId) ||
    dayReservations.find(
      (reservation) =>
        !["cancelled", "completed", "no_show", "declined"].includes(
          reservation.status,
        ),
    ) ||
    dayReservations[0];
  const metrics = {
    needsAction: dayReservations.filter(reservationNeedsAction).length,
    confirmed: dayReservations.filter((item) => item.status === "confirmed").length,
    arrived: dayReservations.filter((item) =>
      ["checked_in", "waiting", "arrived"].includes(item.status),
    ).length,
    seated: dayReservations.filter((item) => item.status === "seated").length,
    completed: dayReservations.filter((item) => item.status === "completed").length,
    noShow: dayReservations.filter((item) => item.status === "no_show").length,
  };
  const setupEnabled = Boolean(
    locationId && (resources.length || dayReservations.length),
  );
  const assigningReservation = dayReservations.find(
    (reservation) => reservation.id === assigningReservationId,
  );

  function openCreateModal(kind: "reservation" | "walkin" | "waitlist") {
    const date = clampReservationDate(selectedDate, "America/New_York");
    setCreateDate(date);
    const options = generateQuarterHourOptions({
      selectedDate: date,
      timeZone: "America/New_York",
    });
    setCreateTime(
      options[0]?.value || getNextFutureQuarterTime("America/New_York"),
    );
    setModal(kind);
  }

  const locationName =
    adminSummary?.location?.name ||
    adminSummary?.location?.restaurant_name ||
    "TheOutHaven location";
  const modalDate = clampReservationDate(
    createDate || selectedDate,
    "America/New_York",
  );
  const modalTimeOptions = generateQuarterHourOptions({
    selectedDate: modalDate,
    timeZone: "America/New_York",
  });

  const topActions = (
    <>
      <Link
        className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black"
        aria-disabled={!locationId}
        href={locationId ? actionLinks.locationDashboardHref : "#"}
      >
        ← Location
      </Link>
      <Link
        className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black"
        aria-disabled={!locationId}
        href={actionLinks.bookingHref || "#"}
      >
        Guest booking page <ExternalLink size={14} />
      </Link>
      <Link
        className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black"
        aria-disabled={!locationId}
        href={actionLinks.embedSetupHref || "#"}
      >
        <Link2 size={14} /> Booking links
      </Link>
      <Link
        className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black"
        aria-disabled={!locationId}
        href={actionLinks.qrHref || "#"}
      >
        <QrCode size={14} /> QR codes
      </Link>
      <button
        type="button"
        disabled={!locationId}
        onClick={() => openCreateModal("reservation")}
        className="reserve-primary inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Plus size={14} /> New reservation
      </button>
      <button
        type="button"
        disabled={!locationId}
        onClick={() => openCreateModal("walkin")}
        className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--reserve-primary)] px-3 text-xs font-black text-[var(--reserve-primary)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <UserPlus size={14} /> Add walk-in
      </button>
    </>
  );

  return (
    <ReserveCommandCenterShell
      locationName={locationName}
      locationId={locationId}
      locationType={locationType}
      activeTab={activeTab}
      activeSection=""
      onTabChange={switchTab}
      actions={topActions}
      setupEnabled={setupEnabled}
      userLabel={adminLocationId ? "Admin access" : "Owner access"}
      actingContext={actionContext()}
    >
      {assigningReservation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="reserve-card max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] reserve-muted">
                  {vocab.assignResource}
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {getReservationGuestName(assigningReservation)} · {vocab.partyLabel}{" "}
                  {assigningReservation.party_size}
                </h2>
                <p className="mt-1 text-sm reserve-muted">
                  Choose an available {vocab.resource.toLowerCase()} for this reservation. Unavailable options cannot be selected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningReservationId("")}
                className="reserve-soft rounded-full px-3 py-1.5 text-sm font-black"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((resource) => {
                const state = getFloorSnapshotState(resource, dayReservations);
                return (
                  <button
                    key={resourceId(resource) || resourceName(resource)}
                    type="button"
                    disabled={
                      !state.available || updatingId === assigningReservation.id
                    }
                    onClick={() => assignResource(assigningReservation, resource)}
                    className="reserve-soft rounded-2xl p-4 text-left transition hover:border-[#e1062a]/35 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <p className="text-lg font-black">{resourceName(resource)}</p>
                    <p className="text-sm reserve-muted">
                      {resourceCapacity(resource)
                        ? `Seats ${resourceCapacity(resource)}`
                        : "Capacity not set"}
                    </p>
                    <p className="mt-3 text-xs font-black">
                      {state.status === "Seated" ? vocab.seatedStatus : state.status} ·{" "}
                      {state.available ? "Available" : "Unavailable"}
                    </p>
                    {state.reservation ? (
                      <p className="mt-1 truncate text-xs reserve-muted">
                        {getReservationGuestName(state.reservation)} · {vocab.partyLabel}{" "}
                        {state.reservation.party_size || "—"}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <form
            onSubmit={(event) => submitCreate(event, modal)}
            className="reserve-card w-full max-w-xl rounded-[2rem] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] reserve-muted">
                  {modal === "waitlist"
                    ? "Waitlist"
                    : modal === "walkin"
                      ? "Walk-in guest"
                      : "Reservation"}
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {modal === "waitlist"
                    ? "Add guest to waitlist"
                    : modal === "walkin"
                      ? "Add walk-in"
                      : "New reservation"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="reserve-soft rounded-full px-3 py-1.5 text-sm font-black"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">
                {vocab.customer} name
                <input
                  name="guestName"
                  required={modal !== "walkin"}
                  placeholder={modal === "walkin" ? "Walk-in guest" : "Guest name"}
                  className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                />
              </label>
              <label className="text-sm font-bold">
                {vocab.partySizeLabel}
                <input
                  name="partySize"
                  required
                  type="number"
                  min="1"
                  defaultValue="2"
                  className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                />
              </label>

              {modal !== "walkin" ? (
                <>
                  <label className="text-sm font-bold">
                    Phone
                    <input
                      name="phone"
                      inputMode="tel"
                      placeholder="Guest phone"
                      className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Email
                    <input
                      name="email"
                      type="email"
                      placeholder="Guest email"
                      className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                    />
                  </label>
                </>
              ) : null}

              <label className="text-sm font-bold">
                Date
                <input
                  name="date"
                  type="date"
                  required
                  min={getTodayLocalDate("America/New_York")}
                  value={createDate}
                  onChange={(event) => {
                    const nextDate = clampReservationDate(
                      event.target.value,
                      "America/New_York",
                    );
                    setCreateDate(nextDate);
                    const options = generateQuarterHourOptions({
                      selectedDate: nextDate,
                      timeZone: "America/New_York",
                    });
                    setCreateTime((current) =>
                      options.some((option) => option.value === current)
                        ? current
                        : options[0]?.value ||
                          getNextFutureQuarterTime("America/New_York"),
                    );
                  }}
                  className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                />
              </label>
              <label className="text-sm font-bold">
                Time
                <select
                  name="time"
                  required
                  value={createTime}
                  onChange={(event) => setCreateTime(event.target.value)}
                  className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                >
                  {modalTimeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {modal === "reservation" ? (
                <label className="text-sm font-bold">
                  Reservation length
                  <select
                    name="duration"
                    defaultValue="90"
                    className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                  >
                    <option value="60">1 hour</option>
                    <option value="75">1 hour 15 minutes</option>
                    <option value="90">1 hour 30 minutes</option>
                    <option value="105">1 hour 45 minutes</option>
                    <option value="120">2 hours</option>
                    <option value="150">2 hours 30 minutes</option>
                    <option value="180">3 hours</option>
                  </select>
                </label>
              ) : null}

              <label className="text-sm font-bold sm:col-span-2">
                Guest notes
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Optional requests or notes for your team"
                  className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"
                />
              </label>
            </div>

            <button
              disabled={submitting}
              className="reserve-primary mt-5 w-full rounded-full px-5 py-3 font-black disabled:opacity-60"
            >
              {submitting
                ? "Saving…"
                : modal === "waitlist"
                  ? "Add to waitlist"
                  : modal === "walkin"
                    ? "Add walk-in"
                    : "Create reservation"}
            </button>
          </form>
        </div>
      ) : null}

      {adminLocationId ? (
        <>
          <AdminActingAsLocationBanner
            locationId={adminLocationId}
            locationName={locationName}
            locationType={locationType}
            plan={adminSummary?.location?.plan}
            reservationAccess={adminSummary?.reservationAccess?.plan}
          />
          <div className="mb-3">
            <AdminLocationSearch compact />
          </div>
        </>
      ) : null}

      {message ? (
        <div className="mb-4">
          <ReserveHumanMessage tone={message.tone}>{message.text}</ReserveHumanMessage>
        </div>
      ) : null}

      {!locationId ? (
        <div className="mb-4">
          <ReserveHumanMessage tone="warning">
            Choose a location to manage reservations, seating, guest booking, and the waitlist.
          </ReserveHumanMessage>
        </div>
      ) : null}

      <section className="reserve-card mb-4 rounded-2xl p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[var(--reserve-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--reserve-primary)]">
              Selected day
            </span>
            <h2 className="text-lg font-black">
              {formatShortDate(new Date(`${selectedDate}T12:00:00`))}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="reserve-soft grid h-9 w-9 place-items-center rounded-full"
              onClick={() =>
                setSelectedDate(
                  clampReservationDate(
                    addDays(selectedDate, -1),
                    "America/New_York",
                  ),
                )
              }
              aria-label="Previous day"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="reserve-primary h-9 rounded-full px-3 text-xs font-black"
              onClick={() => setSelectedDate(getTodayLocalDate("America/New_York"))}
            >
              Today
            </button>
            <button
              type="button"
              className="reserve-soft grid h-9 w-9 place-items-center rounded-full"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              aria-label="Next day"
            >
              <ChevronRight size={16} />
            </button>

            <select
              aria-label="Service period"
              className="reserve-soft h-9 rounded-full px-3 text-xs font-bold"
            >
              <option>All service periods</option>
              <option>Dinner</option>
              <option>Lunch</option>
            </select>
            <select
              aria-label="Reservation status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="reserve-soft h-9 rounded-full px-3 text-xs font-bold"
            >
              <option value="all">All reservations</option>
              <option value="needs_action">Needs action</option>
              {statusTabs.slice(1).map((status) => (
                <option key={status} value={status}>
                  {getReservationStatusLabel(status, vocab)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, phone, email, or notes"
              aria-label="Search reservations"
              className="reserve-soft h-9 min-w-[260px] flex-1 rounded-full px-3 text-sm xl:min-w-[320px]"
            />
            <button
              type="button"
              onClick={() => void loadAll()}
              className="reserve-soft inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-black"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <span className="text-xs reserve-muted">
              Updates automatically · {lastUpdated ? "just updated" : "loading"}
            </span>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <ReserveMetricCard
          label="Needs action"
          value={metrics.needsAction}
          active={statusFilter === "needs_action"}
          onClick={() => setStatusFilter("needs_action")}
        />
        <ReserveMetricCard
          label="Confirmed"
          value={metrics.confirmed}
          active={statusFilter === "confirmed"}
          onClick={() => setStatusFilter("confirmed")}
        />
        <ReserveMetricCard
          label="Waiting"
          value={metrics.arrived}
          active={statusFilter === "checked_in"}
          onClick={() => setStatusFilter("checked_in")}
        />
        <ReserveMetricCard
          label={vocab.seatedStatus}
          value={metrics.seated}
          active={statusFilter === "seated"}
          onClick={() => setStatusFilter("seated")}
        />
        <ReserveMetricCard
          label="Completed"
          value={metrics.completed}
          active={statusFilter === "completed"}
          onClick={() => setStatusFilter("completed")}
        />
        <ReserveMetricCard
          label="Waitlist"
          value={waitlist.length}
          active={activeTab === "waitlist"}
          onClick={() => switchTab("waitlist")}
        />
        <ReserveMetricCard
          label="No-shows"
          value={metrics.noShow}
          active={statusFilter === "no_show"}
          onClick={() => setStatusFilter("no_show")}
        />
      </section>

      {activeTab === "today" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(430px,0.42fr)_minmax(620px,1fr)]">
          <section className="reserve-card rounded-2xl p-4">
            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] reserve-muted">
                Today’s reservations
              </p>
              <h2 className="mt-0.5 text-xl font-black">
                {filtered.length} {filtered.length === 1 ? "reservation" : "reservations"}
              </h2>
            </div>
            {loading ? (
              <ReserveEmptyState
                title="Loading reservations…"
                message="We’re checking the latest reservation list."
              />
            ) : filtered.length ? (
              <ReserveTimeline
                vocabulary={vocab}
                reservations={filtered}
                selectedId={selected?.id}
                onSelect={(reservation) => setSelectedId(reservation.id)}
                onStatus={updateStatus}
                onAssign={(reservation) => {
                  setSelectedId(reservation.id);
                  setAssigningReservationId(reservation.id);
                }}
                onTableReady={sendTableReady}
                updatingId={updatingId}
              />
            ) : (
              <ReserveEmptyState
                title="No reservations for this day"
                message="New reservations and changes will appear here automatically."
              />
            )}
          </section>

          <div className="space-y-4">
            <ReserveFloorSnapshot
              vocabulary={vocab}
              resources={resources}
              reservations={dayReservations}
              settingsHref={settingsHref("layout")}
              assigningReservation={assigningReservation}
              onResourceSelect={(resource) =>
                assigningReservation && assignResource(assigningReservation, resource)
              }
              onReservationSelect={(reservation) => setSelectedId(reservation.id)}
            />
            <div className="grid gap-4 2xl:grid-cols-2">
              <ReserveGuestDetails
                vocabulary={vocab}
                reservation={selected}
                onStatus={updateStatus}
                onAssign={(reservation) => {
                  setSelectedId(reservation.id);
                  setAssigningReservationId(reservation.id);
                }}
                onTableReady={sendTableReady}
                updatingId={updatingId}
                onRefresh={() => loadAll({ silent: true })}
              />
              <ReserveWaitlistPanel
                vocabulary={vocab}
                entries={waitlist}
                onAdd={() => openCreateModal("waitlist")}
                onOffer={notifyWaitlist}
                onViewAll={() => switchTab("waitlist")}
                updatingId={updatingId}
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "floor" ? (
        <ReserveFloorSnapshot
          vocabulary={vocab}
          resources={resources}
          reservations={dayReservations}
          settingsHref={settingsHref("layout")}
          assigningReservation={assigningReservation}
          onResourceSelect={(resource) =>
            assigningReservation && assignResource(assigningReservation, resource)
          }
          onReservationSelect={(reservation) => setSelectedId(reservation.id)}
        />
      ) : null}

      {activeTab === "waitlist" ? (
        <ReserveWaitlistPanel
          vocabulary={vocab}
          entries={waitlist}
          onAdd={() => openCreateModal("waitlist")}
          onOffer={notifyWaitlist}
          onViewAll={() => switchTab("waitlist")}
          updatingId={updatingId}
        />
      ) : null}

      {activeTab === "guests" ? (
        <section className="reserve-card rounded-[2rem] p-5">
          <h2 className="text-2xl font-black">Guests</h2>
          <p className="mt-1 mb-4 text-sm reserve-muted">
            Review guest details and manage reservations for the selected day.
          </p>
          {filtered.length ? (
            <ReserveTimeline
              vocabulary={vocab}
              reservations={filtered}
              selectedId={selected?.id}
              onSelect={(reservation) => setSelectedId(reservation.id)}
              onStatus={updateStatus}
              onAssign={(reservation) => {
                setSelectedId(reservation.id);
                setAssigningReservationId(reservation.id);
              }}
              onTableReady={sendTableReady}
              updatingId={updatingId}
            />
          ) : (
            <ReserveEmptyState
              title="No guests for this day"
              message="Reservations for the selected day will appear here."
            />
          )}
        </section>
      ) : null}

      {activeTab === "calendar" ? (
        <section className="reserve-card rounded-[2rem] p-5">
          <h2 className="text-2xl font-black">Reservation schedule</h2>
          <p className="mt-1 text-sm reserve-muted">
            Choose a day to view its reservations and guest activity.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from(new Set(reservations.map((item) => item.reservation_date)))
              .slice(0, 12)
              .map((date) => {
                const count = reservations.filter(
                  (item) => item.reservation_date === date,
                ).length;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      switchTab("today");
                    }}
                    className="reserve-soft rounded-2xl p-4 text-left transition hover:border-[#e1062a]/35"
                  >
                    <CalendarDays size={18} />
                    <p className="mt-2 font-black">
                      {formatShortDate(new Date(`${date}T12:00:00`))}
                    </p>
                    <p className="text-sm reserve-muted">
                      {count} {count === 1 ? "reservation" : "reservations"}
                    </p>
                  </button>
                );
              })}
          </div>
          {!reservations.length ? (
            <div className="mt-4">
              <ReserveEmptyState
                title="No upcoming reservations yet"
                message="Future reservation days will appear here automatically."
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </ReserveCommandCenterShell>
  );
}
