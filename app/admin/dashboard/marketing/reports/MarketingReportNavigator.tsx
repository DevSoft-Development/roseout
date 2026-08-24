"use client";

import { useEffect } from "react";

function buttonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === text) as HTMLButtonElement | undefined;
}

function scrollToResults() {
  const exportButton = buttonByText("Export CSV");
  const resultSection = exportButton?.closest("section");
  if (resultSection) {
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  return false;
}

export default function MarketingReportNavigator({ autoRun = false }: { autoRun?: boolean }) {
  useEffect(() => {
    const runButton = buttonByText("Run report");
    if (!runButton) return;

    let requestedByNavigator = false;
    let scrollAfterRun = false;

    const onRunClick = () => {
      scrollAfterRun = true;
    };

    runButton.addEventListener("click", onRunClick);

    const observer = new MutationObserver(() => {
      if (scrollAfterRun && scrollToResults()) {
        scrollAfterRun = false;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (autoRun && !requestedByNavigator) {
      requestedByNavigator = true;
      scrollAfterRun = true;
      window.setTimeout(() => runButton.click(), 50);
    }

    return () => {
      runButton.removeEventListener("click", onRunClick);
      observer.disconnect();
    };
  }, [autoRun]);

  return null;
}
