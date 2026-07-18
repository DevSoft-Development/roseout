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
  resultType: "restaurant" | "activity" | "pair";
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

function parseLocationLink(anchor: HTMLAnchorElement) {
  const match = anchor.pathname.match(/^\/locations\/(restaurants|activities)\/([0-9a-f-]{36})/i);
  if (!match) return null;
  return {
    kind: match[1] === "restaurants" ? "restaurant" : "activity",
    id: match[2],
  } as const;
}

function cardFor(anchor: HTMLAnchorElement) {
  const article = anchor.closest("article");
  if (article) return article as HTMLElement;

  let current: HTMLElement | null = anchor.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const links = Array.from(current.querySelectorAll<HTMLAnchorElement>('a[href^="/locations/"]'));
    if (links.length >= 1 && current.getBoundingClientRect().height >= 120) return current;
    current = current.parentElement;
  }
  return null;
}

function identityFor(card: HTMLElement): ResultIdentity | null {
  const identities = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href^="/locations/"]'))
    .map(parseLocationLink)
    .filter(Boolean) as Array<{ kind: "restaurant" | "activity"; id: string }>;

  const unique = Array.from(new Map(identities.map((item) => [`${item.kind}:${item.id}`, item])).values());
  const restaurant = unique.find((item) => item.kind === "restaurant") || null;
  const activity = unique.find((item) => item.kind === "activity") || null;

  if (restaurant && activity) {
    return {
      resultType: "pair",
      locationId: null,
      restaurantLocationId: restaurant.id,
      activityLocationId: activity.id,
    };
  }

  const single = restaurant || activity;
  if (!single) return null;
  return {
    resultType: single.kind,
    locationId: single.id,
    restaurantLocationId: null,
    activityLocationId: null,
  };
}

async function postSearchSignal(endpoint: "feedback" | "impression", payload: Record<string, unknown>) {
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

function installFeedbackControls(card: HTMLElement, identity: ResultIdentity, position: number) {
  if (card.querySelector("[data-search-feedback-controls]")) return;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-search-feedback-controls", "true");
  wrapper.className = "mt-3 border-t border-white/10 pt-3";

  const prompt = document.createElement("button");
  prompt.type = "button";
  prompt.className = "text-[10px] font-black uppercase tracking-[0.12em] text-white/45 transition hover:text-white";
  prompt.textContent = "Not a good match?";
  prompt.setAttribute("aria-expanded", "false");

  const options = document.createElement("div");
  options.className = "mt-2 hidden flex-wrap gap-2";

  for (const [value, label] of FEEDBACK_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black text-white/65 transition hover:border-[#e1062a]/50 hover:text-white";
    button.textContent = label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      const result = await postSearchSignal("feedback", {
        feedbackType: value,
        resultPosition: position,
        ...identity,
      });
      wrapper.textContent = result?.success === false ? "Feedback could not be saved." : "Thanks — this helps improve results.";
      wrapper.className = "mt-3 border-t border-white/10 pt-3 text-xs font-semibold text-white/55";
    });
    options.appendChild(button);
  }

  prompt.addEventListener("click", () => {
    const open = options.classList.toggle("hidden") === false;
    prompt.setAttribute("aria-expanded", String(open));
  });

  wrapper.append(prompt, options);
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
          void postSearchSignal("impression", { resultPosition: position, ...identity });
        }
      },
      { threshold: [0.5] },
    );

    const scan = () => {
      const cards: HTMLElement[] = [];
      const seen = new Set<HTMLElement>();
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="/locations/"]')) {
        const card = cardFor(anchor);
        if (!card || seen.has(card) || !identityFor(card)) continue;
        seen.add(card);
        cards.push(card);
      }

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

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      impressionObserver.disconnect();
    };
  }, []);

  return null;
}
