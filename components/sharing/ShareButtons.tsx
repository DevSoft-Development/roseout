"use client";

import { useState } from "react";

export default function ShareButtons({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }

    await copyLink();
  }

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={share} className="rounded-full bg-[#1b1210] px-5 py-4 text-sm font-black text-white">
        Share outing
      </button>
      <button type="button" onClick={copyLink} className="rounded-full border border-black/10 bg-white px-5 py-4 text-sm font-black text-[#1b1210]">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
