"use client";

import Image from "next/image";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";

type SearchRecord = Record<string, unknown>;

type PreviewItem = {
  kind: "pair" | "single";
  record: SearchRecord;
  parts: SearchRecord[];
};

type GeneratePayload = {
  pairs?: unknown;
  cards?: unknown;
  matched_locations?: unknown;
  restaurants?: unknown;
  activities?: unknown;
  error?: unknown;
  user_message?: unknown;
};

const defaultPrompt = "Italian dinner and comedy show in Manhattan";
const fallbackImage = "/og-image.svg";

function asRecord(value: unknown): SearchRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as SearchRecord)
    : null;
}

function asRecords(value: unknown): SearchRecord[] {
  return Array.isArray(value)
    ? value
        .map(asRecord)
        .filter(
          (item): item is SearchRecord =>
            Boolean(item),
        )
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  return null;
}

function label(value: unknown): string | null {
  const raw = text(value);

  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    cleaned.charAt(0).toUpperCase() +
    cleaned.slice(1)
  );
}

function firstText(
  record: SearchRecord,
  keys: string[],
): string | null {
  for (const key of keys) {
    const found = text(record[key]);

    if (found) {
      return found;
    }
  }

  return null;
}

function locationLabel(
  record: SearchRecord,
): string | null {
  return firstText(record, [
    "neighborhood",
    "borough",
    "city",
    "area",
  ]);
}

function categoryLabel(
  record: SearchRecord,
): string | null {
  return label(
    firstText(record, [
      "display_category",
      "primary_category",
      "category",
      "cuisine",
      "activity_type",
      "location_type",
      "type",
    ]),
  );
}

function ratingLabel(
  record: SearchRecord,
): string | null {
  const rating = numberValue(
    record.rating ??
      record.google_rating ??
      record.average_rating,
  );

  if (!rating) {
    return null;
  }

  const reviews = numberValue(
    record.review_count ??
      record.user_ratings_total ??
      record.google_review_count,
  );

  const formattedRating = rating
    .toFixed(1)
    .replace(/\.0$/, "");

  return reviews
    ? `${formattedRating} ★ (${reviews.toLocaleString()} reviews)`
    : `${formattedRating} ★`;
}

function openStatusLabel(
  record: SearchRecord,
): string | null {
  const explicit =
    record.open_now ?? record.is_open;

  if (explicit === true) {
    return "Open now";
  }

  if (explicit === false) {
    return "Closed now";
  }

  return firstText(record, [
    "open_status",
    "hours_status",
  ]);
}

function walkingTimeLabel(
  record: SearchRecord,
): string | null {
  return firstText(record, [
    "walking_time",
    "walkingTime",
    "walk_time_label",
    "walkTimeLabel",
    "walking_minutes_label",
  ]);
}

function distanceOnlyLabel(
  record: SearchRecord,
): string | null {
  return firstText(record, [
    "walking_distance",
    "distance_label",
    "distance",
    "pair_distance_label",
    "pairDistanceLabel",
  ]);
}

function pairMetadataLabel(
  record: SearchRecord,
): string | null {
  const walking = walkingTimeLabel(record);
  const distance = distanceOnlyLabel(record);

  return (
    [walking, distance]
      .filter(Boolean)
      .join(" · ") || null
  );
}

function pairParts(
  pair: SearchRecord,
): SearchRecord[] {
  return [
    pair.restaurant,
    pair.activity,
    pair.primary,
    pair.secondary,
    pair.first,
    pair.second,
    pair.location_a,
    pair.location_b,
  ]
    .map(asRecord)
    .filter(
      (item): item is SearchRecord =>
        Boolean(item),
    )
    .slice(0, 2);
}

function singleCandidates(
  data: GeneratePayload,
): SearchRecord[] {
  const seen = new Set<string>();

  const sources = [
    data.cards,
    data.matched_locations,
    data.restaurants,
    data.activities,
  ];

  return sources
    .flatMap(asRecords)
    .filter((record) => {
      const key =
        firstText(record, [
          "id",
          "location_id",
          "source_id",
          "name",
          "restaurant_name",
          "activity_name",
          "title",
        ]) ??
        JSON.stringify(record).slice(0, 120);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export function buildPreview(
  data: GeneratePayload,
): PreviewItem[] {
  const validPairs = asRecords(data.pairs)
    .map((pair) => ({
      kind: "pair" as const,
      record: pair,
      parts: pairParts(pair),
    }))
    .filter(
      (item) => item.parts.length >= 2,
    );

  const pairs = validPairs.slice(0, 4);

  if (pairs.length) {
    return pairs;
  }

  return singleCandidates(data).map(
    (record) => ({
      kind: "single" as const,
      record,
      parts: [record],
    }),
  );
}

function imageFor(
  record: SearchRecord,
): string {
  return (
    getLocationImage(record) ??
    fallbackImage
  );
}

export default function PrelaunchSearchPreview() {
  const [prompt, setPrompt] = useState("");

  const [status, setStatus] = useState<
    | "idle"
    | "loading"
    | "results"
    | "empty"
    | "error"
  >("idle");

  const [items, setItems] = useState<
    PreviewItem[]
  >([]);

  const resultsRef =
    useRef<HTMLDivElement | null>(null);

  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const abortRef =
    useRef<AbortController | null>(null);

  const requestIdRef = useRef(0);

  const statusMessage = useMemo(() => {
    if (status === "loading") {
      return "Finding matches…";
    }

    if (status === "results") {
      return "Preview matches are ready.";
    }

    if (status === "empty") {
      return "No preview matches found. Try Italian dinner and comedy show in Manhattan.";
    }

    if (status === "error") {
      return "Preview search failed. Try a neighborhood, cuisine, or activity.";
    }

    return "";
  }, [status]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const input = prompt.trim();

    if (!input || status === "loading") {
      return;
    }

    abortRef.current?.abort();

    const controller =
      new AbortController();

    abortRef.current = controller;

    const requestId =
      requestIdRef.current + 1;

    requestIdRef.current = requestId;

    setStatus("loading");
    setItems([]);

    try {
      const response = await fetch(
        "/api/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            input,
            query: input,
            message: input,
            prompt: input,
            usedCustomPrompt: true,
            source:
              "homepage_prelaunch_preview",
          }),
        },
      );

      const data = (await response
        .json()
        .catch(
          () => ({}),
        )) as GeneratePayload;

      if (
        requestId !==
        requestIdRef.current
      ) {
        return;
      }

      if (!response.ok || data.error) {
        throw new Error("Search failed");
      }

      const preview = buildPreview(data);

      setItems(preview);

      setStatus(
        preview.length
          ? "results"
          : "empty",
      );

      window.setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 50);
    } catch (caught) {
      if (
        (caught as Error).name ===
          "AbortError" ||
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setStatus("error");
      setItems([]);
    }
  }

  return (
    <section
      id="homepage-preview"
      className="mt-8 w-full"
      aria-labelledby="homepage-preview-title"
    >
      <h2
        id="homepage-preview-title"
        className="sr-only"
      >
        Try TheOutHaven search preview
      </h2>

      <form
        onSubmit={submit}
        action="#homepage-preview"
        className="mx-auto w-full max-w-4xl"
      >
        <div className="flex w-full flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.055] p-2 shadow-2xl shadow-black/50 backdrop-blur-xl transition focus-within:border-[#e1062a]/50 focus-within:shadow-[0_0_0_1px_rgba(225,6,42,0.28),0_0_40px_rgba(225,6,42,0.16)] sm:flex-row sm:items-center sm:rounded-full">
          <div className="relative min-w-0 flex-1">
            <span
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[#e1062a]"
              aria-hidden="true"
            >
              ⌕
            </span>

            {!prompt ? (
              <div className="pointer-events-none absolute left-12 right-3 top-1/2 -translate-y-1/2 truncate text-left text-sm font-semibold text-white/42 sm:text-base">
                {defaultPrompt}
                <span className="text-[#e1062a]">
                  |
                </span>
              </div>
            ) : null}

            <input
              ref={inputRef}
              id="outing-prompt"
              name="q"
              type="text"
              value={prompt}
              onChange={(event) =>
                setPrompt(event.target.value)
              }
              enterKeyHint="search"
              inputMode="search"
              aria-label="Search for an outing"
              placeholder=""
              className="h-14 w-full rounded-full border border-white/10 bg-black/60 pl-12 pr-4 text-left text-base font-semibold text-white outline-none transition focus:border-[#e1062a]/60 sm:h-16 sm:border-0 sm:bg-transparent sm:text-lg"
            />
          </div>

          <button
            type="submit"
            disabled={
              status === "loading" ||
              !prompt.trim()
            }
            className="h-14 shrink-0 whitespace-nowrap rounded-full bg-[#e1062a] px-6 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744] focus:outline-none focus:ring-2 focus:ring-[#e1062a]/60 disabled:cursor-not-allowed disabled:opacity-40 sm:h-16 sm:px-8"
          >
            {status === "loading"
              ? "Finding your outing…"
              : "Find my outing"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-emerald-100">
            <span
              className="h-2 w-2 rounded-full bg-emerald-300"
              aria-hidden="true"
            />

            Nearby results on
          </div>
        </div>
      </form>

      <p className="mx-auto mt-5 max-w-4xl text-center text-sm leading-6 text-white/45">
        Type a neighborhood, cuisine,
        activity, or full outing idea to see
        a limited read-only preview.
      </p>

      <div
        aria-live="polite"
        className="sr-only"
      >
        {statusMessage}
      </div>

      <div
        ref={resultsRef}
        className="mt-7"
      >
        {status === "loading" ? (
          <SkeletonCards />
        ) : null}

        {status === "error" ? (
          <StateMessage
            tone="error"
            title="We couldn’t load preview matches right now."
            text="Try another neighborhood, cuisine, or activity like Italian dinner and comedy show in Manhattan."
          />
        ) : null}

        {status === "empty" ? (
          <StateMessage
            title="No preview matches yet."
            text="Try another neighborhood, cuisine, or activity like Italian dinner and comedy show in Manhattan."
          />
        ) : null}

        {status === "results" ? (
          <PreviewResults items={items} />
        ) : null}
      </div>
    </section>
  );
}

function PreviewResults({
  items,
}: {
  items: PreviewItem[];
}) {
  const pairItems = items
    .filter(
      (item) => item.kind === "pair",
    )
    .slice(0, 4);

  const displayItems = pairItems.length
    ? pairItems
    : items.slice(0, 4);

  return (
    <section
      aria-labelledby="preview-results-heading"
      className="space-y-5"
    >
      <div className="rounded-2xl border border-red-900/60 bg-red-950/35 p-4 text-sm font-bold leading-6 text-red-50">
        <p>
          TheOutHaven is currently in
          prelaunch.
        </p>

        <p className="text-red-100/75">
          Full planning tools will be
          available at launch.
        </p>
      </div>

      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff8a9b]">
          Preview results
        </p>

        <h3
          id="preview-results-heading"
          className="mt-2 text-2xl font-black tracking-[-.03em]"
        >
          Here’s a preview of what we found
          ✨
        </h3>

        <p className="mt-1 text-sm text-white/58">
          Real results powered by
          TheOutHaven AI.
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="prelaunch-results-grid"
      >
        {displayItems.map(
          (item, index) =>
            item.kind === "pair" ? (
              <PairCard
                key={`pair-${index}`}
                item={item}
              />
            ) : (
              <SingleCard
                key={`single-${index}`}
                item={item}
              />
            ),
        )}
      </div>
    </section>
  );
}

function SkeletonCards() {
  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      data-testid="preview-skeletons"
    >
      {[0, 1].map((item) => (
        <div
          key={item}
          className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4"
        >
          <div className="h-5 w-40 animate-pulse rounded bg-white/10" />

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="aspect-[16/9] animate-pulse rounded-xl bg-white/[.06]" />
            <div className="aspect-[16/9] animate-pulse rounded-xl bg-white/[.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StateMessage({
  title,
  text: message,
  tone = "default",
}: {
  title: string;
  text: string;
  tone?: "default" | "error";
}) {
  return (
    <div
      role={
        tone === "error"
          ? "alert"
          : undefined
      }
      className={`rounded-2xl border p-4 text-sm leading-6 ${
        tone === "error"
          ? "border-red-300/20 bg-red-950/30 text-red-100"
          : "border-white/10 bg-black/30 text-white/70"
      }`}
    >
      <p className="font-black">
        {title}
      </p>

      <p>{message}</p>
    </div>
  );
}

function PairCard({
  item,
}: {
  item: PreviewItem;
}) {
  const [restaurant, activity] =
    item.parts;

  const title =
    firstText(item.record, [
      "title",
      "pair_title",
    ]) ??
    `${getLocationName(
      restaurant,
      "Dinner",
    )} + ${getLocationName(
      activity,
      "Activity",
    )}`;

  const metadata =
    pairMetadataLabel(item.record);

  return (
    <article
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.025]"
      data-testid="prelaunch-pair-card"
    >
      <header className="border-b border-white/10 p-[1.125rem] sm:p-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff8a9b]">
          Paired outing preview
        </p>

        <h4 className="mt-1.5 text-xl font-black tracking-[-.02em]">
          {title}
        </h4>

        {metadata ? (
          <p className="mt-1.5 text-sm text-white/58">
            {metadata}
          </p>
        ) : null}
      </header>

      <div
        className="relative grid flex-1 grid-cols-2 items-start"
        data-testid="prelaunch-pair-grid"
      >
        <LocationPanel
          record={restaurant}
          label="Restaurant"
          side="left"
        />

        <LocationPanel
          record={activity}
          label="Activity"
          side="right"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[calc(1rem+((100%-2rem)*9/32))] z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#ff5f7c]/45 bg-[#e1062a] text-base shadow-xl shadow-black/40"
        >
          🚶
        </div>
      </div>
    </article>
  );
}

function LocationPanel({
  record,
  label: panelLabel,
  side,
}: {
  record: SearchRecord;
  label: "Restaurant" | "Activity";
  side?: "left" | "right";
}) {
  const name = getLocationName(
    record,
    "Recommended stop",
  );

  const categoryAndArea = [
    categoryLabel(record),
    locationLabel(record),
  ]
    .filter(Boolean)
    .join(" · ");

  const rating = ratingLabel(record);

  const openStatus =
    openStatusLabel(record);

  const ratingValue =
    rating?.split(" (")[0] ?? null;

  const reviewValue =
    rating?.includes(" (")
      ? `(${rating.split(" (")[1]}`
      : null;

  return (
    <section
      className={`min-w-0 p-4 ${
        side === "left"
          ? "border-r border-white/10"
          : ""
      }`}
      data-testid={`prelaunch-${panelLabel.toLowerCase()}-panel`}
    >
      <div
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-white/[.06]"
        data-testid="prelaunch-image-frame"
      >
        <Image
          src={imageFor(record)}
          alt={`${name} ${panelLabel.toLowerCase()} preview`}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          unoptimized
          className="object-cover"
        />

        <span className="absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[.6rem] font-black uppercase tracking-[.14em] text-white backdrop-blur-sm">
          {panelLabel}
        </span>
      </div>

      <h5 className="mt-3 line-clamp-2 text-base font-black leading-snug">
        {name}
      </h5>

      {categoryAndArea ? (
        <p className="mt-1 text-sm text-white/55">
          {categoryAndArea}
        </p>
      ) : null}

      {ratingValue ? (
        <p className="mt-1.5 text-sm">
          <span className="font-bold text-[#ff5f7c]">
            {ratingValue}
          </span>

          {reviewValue ? (
            <span className="ml-2 text-white/55">
              {reviewValue}
            </span>
          ) : null}
        </p>
      ) : null}

      {openStatus ? (
        <p className="mt-1.5 text-sm text-white/55">
          {openStatus}
        </p>
      ) : null}
    </section>
  );
}

function SingleCard({
  item,
}: {
  item: PreviewItem;
}) {
  return (
    <div className="h-full rounded-[1.5rem] border border-white/10 bg-white/[.025]">
      <LocationPanel
        record={item.record}
        label="Activity"
      />
    </div>
  );
}