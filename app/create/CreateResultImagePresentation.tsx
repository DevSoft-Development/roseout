"use client";

import { useEffect } from "react";

const RESULT_CARD_SELECTOR = 'article[data-ui-version="results-card-clean-v2"]';
const RESULT_IMAGE_SELECTOR = 'img[src]:not([src="/toh_logo.png"])';

function applyImageFit(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(RESULT_CARD_SELECTOR).forEach((card) => {
    card.querySelectorAll<HTMLImageElement>(RESULT_IMAGE_SELECTOR).forEach((image) => {
      image.style.objectFit = "contain";
      image.style.objectPosition = "center";
      image.style.transform = "none";
      image.style.backgroundColor = "#0a0a0a";
    });
  });
}

export default function CreateResultImagePresentation() {
  useEffect(() => {
    applyImageFit();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          applyImageFit(node);
          if (node.matches?.(RESULT_CARD_SELECTOR)) {
            applyImageFit(node.parentNode || document);
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
