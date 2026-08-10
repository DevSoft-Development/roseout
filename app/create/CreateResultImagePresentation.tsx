"use client";

import { useEffect } from "react";

const RESULT_CARD_SELECTOR = 'article[data-ui-version="results-card-clean-v2"]';
const RESULT_IMAGE_SELECTOR = 'img[src]:not([src="/toh_logo.png"])';
const BACKDROP_ATTR = "data-toh-full-image-backdrop";
const GRID_ATTR = "data-toh-result-grid";
const STYLE_ID = "toh-create-result-grid-style";

function classText(element: Element) {
  const value = element.getAttribute("class");
  return typeof value === "string" ? value : "";
}

function installGridStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${GRID_ATTR}="true"] {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 12px !important;
      align-items: stretch !important;
    }

    @media (min-width: 768px) {
      [${GRID_ATTR}="true"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1024px) {
      [${GRID_ATTR}="true"] {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1280px) {
      [${GRID_ATTR}="true"] {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
    }

    ${RESULT_CARD_SELECTOR} {
      min-width: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

function removeLegacyBackdrop(frame: HTMLElement) {
  frame
    .querySelectorAll<HTMLImageElement>(`img[${BACKDROP_ATTR}="true"]`)
    .forEach((backdrop) => backdrop.remove());
}

function restoreLogoPlaceholder(frame: HTMLElement) {
  Array.from(frame.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (!child.querySelector('img[src="/toh_logo.png"]')) return;
    child.style.display = "";
  });
}

function positionFrameOverlays(frame: HTMLElement) {
  Array.from(frame.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child instanceof HTMLImageElement) return;

    const classes = classText(child);

    if (classes.includes("bg-gradient-to-t") || classes.includes("absolute inset-0")) {
      child.style.zIndex = "2";
      child.style.pointerEvents = "none";
    }

    if (
      classes.includes("absolute bottom-2.5 right-2.5") ||
      classes.includes("sm:bottom-3")
    ) {
      child.style.zIndex = "5";
      child.style.top = "10px";
      child.style.left = "10px";
      child.style.right = "auto";
      child.style.bottom = "auto";
      child.style.alignItems = "center";
    }
  });

  frame.querySelectorAll<HTMLElement>("span.absolute").forEach((overlay) => {
    overlay.style.zIndex = "5";
  });
}

function prepareImage(image: HTMLImageElement) {
  if (!image.src || image.getAttribute(BACKDROP_ATTR) === "true") return;

  const frame = image.parentElement;
  if (!(frame instanceof HTMLElement)) return;

  removeLegacyBackdrop(frame);
  restoreLogoPlaceholder(frame);

  frame.style.position = "relative";
  frame.style.overflow = "hidden";
  frame.style.backgroundColor = "#090909";
  frame.style.isolation = "isolate";
  frame.style.height = "auto";
  frame.style.aspectRatio = "4 / 3";

  image.style.position = "absolute";
  image.style.inset = "0";
  image.style.zIndex = "1";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";
  image.style.padding = "0";
  image.style.objectFit = "cover";
  image.style.objectPosition = "center";
  image.style.transform = "none";
  image.style.filter = "none";
  image.style.backgroundColor = "transparent";

  positionFrameOverlays(frame);
}

function markResultGrid(card: HTMLElement) {
  const grid = card.parentElement;
  if (!(grid instanceof HTMLElement)) return;
  grid.setAttribute(GRID_ATTR, "true");
}

function applyPresentation(root: ParentNode = document) {
  const cards =
    root instanceof HTMLElement && root.matches(RESULT_CARD_SELECTOR)
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>(RESULT_CARD_SELECTOR));

  cards.forEach((card) => {
    markResultGrid(card);

    card.querySelectorAll<HTMLImageElement>(RESULT_IMAGE_SELECTOR).forEach((image) => {
      if (image.getAttribute(BACKDROP_ATTR) === "true") return;
      prepareImage(image);
    });
  });
}

export default function CreateResultImagePresentation() {
  useEffect(() => {
    let animationFrame = 0;

    installGridStyles();

    const scheduleApply = (root: ParentNode = document) => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => applyPresentation(root));
    };

    scheduleApply();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          scheduleApply();
          return;
        }

        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLImageElement &&
          mutation.target.getAttribute(BACKDROP_ATTR) !== "true"
        ) {
          scheduleApply();
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class"],
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
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      document.removeEventListener("load", handleLoad, true);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
