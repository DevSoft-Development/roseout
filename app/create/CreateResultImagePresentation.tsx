"use client";

import { useEffect } from "react";

const RESULT_CARD_SELECTOR = 'article[data-ui-version="results-card-clean-v2"]';
const RESULT_IMAGE_SELECTOR = 'img[src]:not([src="/toh_logo.png"])';
const PREPARED_ATTR = "data-toh-full-image-prepared";
const BACKDROP_ATTR = "data-toh-full-image-backdrop";

function ensureBackdrop(image: HTMLImageElement) {
  const frame = image.parentElement;
  if (!frame) return;

  frame.style.position = "relative";
  frame.style.overflow = "hidden";
  frame.style.backgroundColor = "#0a0a0a";

  let backdrop = frame.querySelector<HTMLImageElement>(`img[${BACKDROP_ATTR}="true"]`);
  if (!backdrop) {
    backdrop = document.createElement("img");
    backdrop.setAttribute(BACKDROP_ATTR, "true");
    backdrop.alt = "";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.decoding = "async";
    backdrop.loading = "lazy";
    backdrop.referrerPolicy = "no-referrer";
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    backdrop.style.objectFit = "cover";
    backdrop.style.objectPosition = "center";
    backdrop.style.filter = "blur(14px) brightness(0.6)";
    backdrop.style.transform = "scale(1.08)";
    backdrop.style.opacity = "0.72";
    backdrop.style.pointerEvents = "none";
    backdrop.style.zIndex = "0";
    frame.insertBefore(backdrop, frame.firstChild);
  }

  if (backdrop.src !== image.src) backdrop.src = image.src;
}

function prepareImage(image: HTMLImageElement) {
  if (!image.src || image.getAttribute(BACKDROP_ATTR) === "true") return;

  ensureBackdrop(image);

  image.setAttribute(PREPARED_ATTR, "true");
  image.style.position = "relative";
  image.style.zIndex = "1";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "contain";
  image.style.objectPosition = "center";
  image.style.transform = "none";
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";
  image.style.backgroundColor = "transparent";
}

function applyImagePresentation(root: ParentNode = document) {
  const cards = root instanceof HTMLElement && root.matches(RESULT_CARD_SELECTOR)
    ? [root]
    : Array.from(root.querySelectorAll<HTMLElement>(RESULT_CARD_SELECTOR));

  cards.forEach((card) => {
    card.querySelectorAll<HTMLImageElement>(RESULT_IMAGE_SELECTOR).forEach((image) => {
      if (image.getAttribute(BACKDROP_ATTR) === "true") return;
      prepareImage(image);
    });
  });
}

export default function CreateResultImagePresentation() {
  useEffect(() => {
    let frame = 0;

    const scheduleApply = (root: ParentNode = document) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyImagePresentation(root));
    };

    scheduleApply();

    const observer = new MutationObserver((mutations) => {
      let shouldReapply = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldReapply = true;
          break;
        }

        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLImageElement &&
          mutation.target.getAttribute(BACKDROP_ATTR) !== "true"
        ) {
          shouldReapply = true;
          break;
        }
      }

      if (shouldReapply) scheduleApply();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class", "style"],
    });

    const handleLoad = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.closest(RESULT_CARD_SELECTOR)) return;
      if (target.getAttribute(BACKDROP_ATTR) === "true") return;
      prepareImage(target);
    };

    document.addEventListener("load", handleLoad, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("load", handleLoad, true);
    };
  }, []);

  return null;
}
