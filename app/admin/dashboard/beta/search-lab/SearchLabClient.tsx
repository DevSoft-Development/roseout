"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type QaSearchEngine = "legacy" | "v2" | "compare";

const OPTIONS: Array<{
  value: QaSearchEngine;
  label: string;
  description: string;
}> = [
  {
    value: "legacy",
    label: "Legacy",
    description: "Run the current production search pipeline only.",
  },
  {
    value: "v2",
    label: "V2",
    description: "Run Search Core V2 only.",
  },
  {
    value: "compare",
    label: "Compare",
    description: "Run Legacy and V2 for every prompt and keep both outputs.",
  },
];

const COOKIE_NAME = "search_qa_engine";
const STORAGE_KEY = "theouthaven.searchQaEngine";

function isEngine(value: unknown): value is QaSearchEngine {
  return value === "legacy" || value === "v2" || value === "compare";
}

function resolveInitialEngine(
  stored: string | null,
  cookieValue: string | undefined,
): QaSearchEngine {
  if (isEngine(stored)) return stored;
  if (isEngine(cookieValue)) return cookieValue;
  return "legacy";
}

export default function SearchLabClient(_props: { initialQuery?: string }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [engine, setEngine] = useState<QaSearchEngine>("legacy");
  const [ready, setReady] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const cookieValue = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.split("=")[1];
    const initial = resolveInitialEngine(stored, cookieValue);
    setEngine(initial);
    document.cookie = `${COOKIE_NAME}=${initial}; path=/; max-age=31536000; samesite=lax`;
    setReady(true);
  }, []);

  useEffect(() => {
    const section = document.querySelector<HTMLElement>(
      '[data-testid="search-health-search-lab"]',
    );
    if (!section) return;

    const standaloneWrapper = hostRef.current?.parentElement;
    const previousDisplay = standaloneWrapper?.style.display;
    if (standaloneWrapper) standaloneWrapper.style.display = "none";

    const mount = document.createElement("div");
    mount.dataset.qaEngineSelector = "true";
    mount.className = "mb-5";

    const header = section.firstElementChild;
    if (header?.nextSibling) {
      section.insertBefore(mount, header.nextSibling);
    } else {
      section.appendChild(mount);
    }
    setPortalTarget(mount);

    return () => {
      setPortalTarget(null);
      mount.remove();
      if (standaloneWrapper) standaloneWrapper.style.display = previousDisplay ?? "";
    };
  }, []);

  function selectEngine(next: QaSearchEngine) {
    setEngine(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(
      new CustomEvent("theouthaven:search-qa-engine", { detail: next }),
    );
  }

  const selector = (
    <section
      aria-label="QA search engine"
      className="rounded-2xl border border-rose-500/20 bg-[#0d0908] p-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
            Search engine
          </p>
          <h3 className="mt-1 text-lg font-black text-white">
            Choose the engine for both QA search fields
          </h3>
          <p className="mt-1 text-sm text-white/50">
            The selection applies to Single Search QA and Batch Search QA.
            Compare runs both engines for every prompt and keeps both complete
            responses in the result details.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {OPTIONS.map((option) => {
            const active = engine === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!ready}
                onClick={() => selectEngine(option.value)}
                className={[
                  "min-w-[150px] rounded-xl border px-4 py-3 text-left transition",
                  active
                    ? "border-rose-500/60 bg-rose-950/45 text-white shadow-[0_0_0_1px_rgba(244,63,94,0.15)]"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:border-rose-400/35 hover:text-white",
                ].join(" ")}
              >
                <span className="block text-sm font-black">{option.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-white/45">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );

  return (
    <>
      <span ref={hostRef} className="hidden" aria-hidden="true" />
      {portalTarget ? createPortal(selector, portalTarget) : null}
    </>
  );
}
