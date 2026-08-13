"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

const TOOLTIP_HALF_WIDTH = 144;
const VIEWPORT_GUTTER = 16;
const HEADER_CLEARANCE = 220;
const TOOLTIP_GAP = 12;

export default function FeatureInfo({
  feature,
  description,
}: {
  feature: string;
  description: string;
}) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(
      TOOLTIP_HALF_WIDTH + VIEWPORT_GUTTER,
      window.innerWidth - TOOLTIP_HALF_WIDTH - VIEWPORT_GUTTER,
    );
    const left = Math.min(
      Math.max(
        rect.left + rect.width / 2,
        TOOLTIP_HALF_WIDTH + VIEWPORT_GUTTER,
      ),
      maxLeft,
    );
    const placement = rect.top < HEADER_CLEARANCE ? "below" : "above";

    setPosition({
      left,
      top:
        placement === "above"
          ? rect.top - TOOLTIP_GAP
          : rect.bottom + TOOLTIP_GAP,
      placement,
    });
  }, []);

  const showTooltip = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  useEffect(() => {
    if (!open) return;

    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${feature}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-[11px] font-black text-white/60 transition hover:border-[#e1062a] hover:bg-[#e1062a]/15 hover:text-white focus-visible:border-[#e1062a] focus-visible:bg-[#e1062a]/15 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1062a]/50"
      >
        <span aria-hidden="true">i</span>
      </button>

      {open && position
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
              className={`pointer-events-none fixed z-[100] w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/15 bg-[#171113] px-3 py-2.5 text-left text-xs font-semibold leading-5 text-white opacity-100 shadow-2xl shadow-black/60 ${position.placement === "above" ? "-translate-y-full" : ""}`}
            >
              {description}
              <span
                aria-hidden="true"
                className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-white/15 bg-[#171113] ${position.placement === "above" ? "top-full -translate-y-1/2 border-b border-r" : "bottom-full translate-y-1/2 border-l border-t"}`}
              />
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
