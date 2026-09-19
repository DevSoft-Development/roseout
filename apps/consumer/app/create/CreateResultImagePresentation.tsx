"use client";

import { useEffect } from "react";

const RESULT_CARD_SELECTOR = 'article[data-ui-version="results-card-clean-v2"]';
const GRID_ATTR = "data-toh-result-grid";
const SKELETON_GRID_ATTR = "data-toh-skeleton-grid";
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
    [${GRID_ATTR}="true"],
    [${SKELETON_GRID_ATTR}="true"] {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 12px !important;
      align-items: stretch !important;
    }

    @media (min-width: 768px) {
      [${GRID_ATTR}="true"],
      [${SKELETON_GRID_ATTR}="true"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1024px) {
      [${GRID_ATTR}="true"],
      [${SKELETON_GRID_ATTR}="true"] {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1280px) {
      [${GRID_ATTR}="true"],
      [${SKELETON_GRID_ATTR}="true"] {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
    }

    ${RESULT_CARD_SELECTOR} {
      min-width: 0 !important;
    }
  `;

  document.head.appendChild(style);
}

function markResultGrid(card: HTMLElement) {
  const grid = card.parentElement;
  if (grid instanceof HTMLElement) grid.setAttribute(GRID_ATTR, "true");
}

function getLogoPlaceholder(frame: HTMLElement) {
  return Array.from(frame.children).find((child) => {
    return (
      child instanceof HTMLElement &&
      Boolean(child.querySelector('img[src="/toh_logo.png"]'))
    );
  }) as HTMLElement | undefined;
}

function positionFrameOverlays(frame: HTMLElement) {
  Array.from(frame.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child instanceof HTMLImageElement) return;
    if (child.querySelector('img[src="/toh_logo.png"]')) return;

    const classes = classText(child);

    if (classes.includes("bg-gradient-to-t")) {
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
    }
  });
}

function prepareResultImage(image: HTMLImageElement) {
  const card = image.closest<HTMLElement>(RESULT_CARD_SELECTOR);
  if (!card) return;
  if (image.getAttribute("src") === "/toh_logo.png") return;

  const frame = image.parentElement;
  if (!(frame instanceof HTMLElement)) return;

  // Keep the media area uniform without rewriting the real image's source,
  // opacity, or load lifecycle. The card's native object-cover class remains
  // authoritative, so a successful image can never be replaced by our logo.
  frame.style.position = "relative";
  frame.style.overflow = "hidden";
  frame.style.height = "auto";
  frame.style.aspectRatio = "4 / 3";
  frame.style.backgroundColor = "#090909";

  image.style.position = "absolute";
  image.style.inset = "0";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  image.style.objectPosition = "center";

  const placeholder = getLogoPlaceholder(frame);
  const revealRealImage = () => {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    image.style.opacity = "1";
    if (placeholder) placeholder.style.display = "none";
  };

  if (image.complete) revealRealImage();
  positionFrameOverlays(frame);
}

function prepareSkeletonGrids(root: ParentNode = document) {
  const grids = Array.from(root.querySelectorAll<HTMLElement>("div.grid"));

  grids.forEach((grid) => {
    const children = Array.from(grid.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (children.length < 3 || children.length > 4) return;
    if (!children.every((child) => classText(child).includes("h-[420px]"))) return;

    const container = grid.parentElement;
    if (!container?.textContent?.includes("TheOutHaven is searching")) return;

    grid.setAttribute(SKELETON_GRID_ATTR, "true");

    // LoadingResults is still hard-coded to three cards. Add one visual-only
    // skeleton so the loading state matches the four-column desktop result grid.
    if (children.length === 3) {
      const fourth = children[0].cloneNode(true) as HTMLElement;
      fourth.setAttribute("aria-hidden", "true");
      fourth.setAttribute("data-toh-extra-skeleton", "true");
      grid.appendChild(fourth);
    }
  });
}

function applyPresentation(root: ParentNode = document) {
  const cards =
    root instanceof HTMLElement && root.matches(RESULT_CARD_SELECTOR)
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>(RESULT_CARD_SELECTOR));

  cards.forEach((card) => {
    markResultGrid(card);
    card
      .querySelectorAll<HTMLImageElement>('img[src]:not([src="/toh_logo.png"])')
      .forEach(prepareResultImage);
  });

  prepareSkeletonGrids(root);
}

export default function CreateResultImagePresentation() {
  useEffect(() => {
    let animationFrame = 0;

    installGridStyles();

    const scheduleApply = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => applyPresentation());
    };

    scheduleApply();

    const observer = new MutationObserver(() => scheduleApply());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const handleLoad = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      if (!image.closest(RESULT_CARD_SELECTOR)) return;
      prepareResultImage(image);
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
