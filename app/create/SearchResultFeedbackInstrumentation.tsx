"use client";

import { useEffect } from "react";

const ACTIVE_SEARCH_KEY = "theouthaven_analytics_active_search";
const SESSION_KEY = "theouthaven_analytics_session_id";
const INSTALLED_ATTR = "data-search-feedback-installed";

const FEEDBACK_OPTIONS = [
  ["not_a_fit", "Not relevant"],
  ["wrong_category", "Wrong category"],
  ["too_far", "Too far"],
  ["closed_or_unavailable", "Closed"],
  ["bad_pair", "Bad pairing"],
  ["duplicate", "Duplicate"],
  ["bad_photo", "Bad photo"],
  ["other", "Other"],
] as const;

type ResultIdentity = {
  resultType: "matched_location" | "pair";
  locationId: string | null;
  restaurantLocationId: string | null;
  activityLocationId: string | null;
};

function readJson(key: string) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function currentContext() {
  const search = readJson(ACTIVE_SEARCH_KEY);
  return {
    searchId: typeof search.search_id === "string" ? search.search_id : null,
    query: typeof search.normalized_query === "string" ? search.normalized_query : null,
    sessionId: window.sessionStorage.getItem(SESSION_KEY),
  };
}

function identityFor(card: HTMLElement): ResultIdentity | null {
  const resultType = card.dataset.searchResultType;
  const locationId = card.dataset.locationId || null;
  const restaurantLocationId = card.dataset.restaurantLocationId || null;
  const activityLocationId = card.dataset.activityLocationId || null;

  if (resultType === "pair" && restaurantLocationId && activityLocationId) {
    return {
      resultType: "pair",
      locationId: null,
      restaurantLocationId,
      activityLocationId,
    };
  }

  if (!locationId) return null;

  return {
    resultType: "matched_location",
    locationId,
    restaurantLocationId: null,
    activityLocationId: null,
  };
}

async function postSearchSignal(
  endpoint: "feedback" | "impression",
  payload: Record<string, unknown>,
) {
  const context = currentContext();
  if (!context.searchId || !context.sessionId) return null;

  const response = await fetch(`/api/search/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      ...payload,
      searchId: context.searchId,
      sessionId: context.sessionId,
      normalizedQuery: context.query,
    }),
  });

  return response.ok ? response.json().catch(() => null) : null;
}

function closeOtherMenus(current: HTMLElement) {
  for (const menu of document.querySelectorAll<HTMLElement>(
    "[data-search-feedback-menu]",
  )) {
    if (menu === current) continue;
    menu.classList.add("hidden");
  }
}

function installFeedbackControls(
  card: HTMLElement,
  identity: ResultIdentity,
  position: number,
) {
  if (card.querySelector("[data-search-feedback-controls]")) return;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-search-feedback-controls", "true");
  wrapper.className = "absolute right-3 top-3 z-20";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-label", "More result actions");
  trigger.setAttribute("aria-expanded", "false");
  trigger.className =
    "flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/70 text-lg font-black leading-none text-white/70 shadow-lg backdrop-blur transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/25";
  trigger.textContent = "⋯";

  const menu = document.createElement("div");
  menu.setAttribute("data-search-feedback-menu", "true");
  menu.className =
    "absolute right-0 top-11 hidden w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-2xl shadow-black/70";

  const feedbackButton = document.createElement("button");
  feedbackButton.type = "button";
  feedbackButton.className =
    "w-full rounded-xl px-3 py-2.5 text-left text-xs font-bold text-white/72 transition hover:bg-white/[0.06] hover:text-white";
  feedbackButton.textContent = "Not a good match";

  const reasons = document.createElement("div");
  reasons.className = "hidden border-t border-white/10 px-1 pb-1 pt-2";

  const heading = document.createElement("p");
  heading.className =
    "px-2 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/35";
  heading.textContent = "Why wasn’t this a match?";
  reasons.appendChild(heading);

  for (const [value, label] of FEEDBACK_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-white/60 transition hover:bg-white/[0.06] hover:text-white";
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      button.disabled = true;
      reasons.querySelectorAll("button").forEach((item) => {
        (item as HTMLButtonElement).disabled = true;
      });

      const result = await postSearchSignal("feedback", {
        feedbackType: value,
        resultPosition: position,
        ...identity,
      });

      menu.textContent =
        result?.success === false
          ? "Feedback could not be saved."
          : "Thanks — feedback received.";
      menu.className =
        "absolute right-0 top-11 w-56 rounded-2xl border border-white/10 bg-[#111111] px-3 py-3 text-xs font-semibold text-white/60 shadow-2xl shadow-black/70";
      trigger.setAttribute("aria-expanded", "true");
    });
    reasons.appendChild(button);
  }

  feedbackButton.addEventListener("click", (event) => {
    event.stopPropagation();
    reasons.classList.toggle("hidden");
  });

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeOtherMenus(menu);
    menu.classList.toggle("hidden", !willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
  });

  menu.addEventListener("click", (event) => event.stopPropagation());
  menu.append(feedbackButton, reasons);
  wrapper.append(trigger, menu);
  card.appendChild(wrapper);
}

export default function SearchResultFeedbackInstrumentation() {
  useEffect(() => {
    const observed = new WeakSet<Element>();
    const impressionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
          const card = entry.target as HTMLElement;
          impressionObserver.unobserve(card);
          const identity = identityFor(card);
          const position = Number(card.dataset.searchResultPosition || 0);
          if (!identity || !position) continue;
          void postSearchSignal("impression", {
            resultPosition: position,
            ...identity,
          });
        }
      },
      { threshold: [0.5] },
    );

    const scan = () => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-search-result-identity]"),
      );

      cards.forEach((card, index) => {
        const position = index + 1;
        card.dataset.searchResultPosition = String(position);

        if (!card.hasAttribute(INSTALLED_ATTR)) {
          card.setAttribute(INSTALLED_ATTR, "true");
          const identity = identityFor(card);
          if (identity) installFeedbackControls(card, identity, position);
        }

        if (!observed.has(card)) {
          observed.add(card);
          impressionObserver.observe(card);
        }
      });
    };

    const closeMenus = () => {
      closeOtherMenus(document.createElement("div"));
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-search-result-identity",
        "data-location-id",
        "data-search-result-type",
      ],
    });
    document.addEventListener("click", closeMenus);

    return () => {
      observer.disconnect();
      impressionObserver.disconnect();
      document.removeEventListener("click", closeMenus);
    };
  }, []);

  return null;
}
