"use client";

import { useState } from "react";

type TheOutHavenMarkProps = {
  className?: string;
  size?: number;
};

export default function TheOutHavenMark({ className = "", size = 24 }: TheOutHavenMarkProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  // Use the current TheOutHaven header logo asset here.
  // Do not fall back to legacy Roseout/R favicon assets.
  const sources = ["/toh_logo.png"];
  const src = sources[sourceIndex];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-red-300/30 bg-red-700/25 shadow-sm shadow-red-950/30 ${className}`}
      style={{ width: size, height: size }}
      aria-label="TheOutHaven"
      role="img"
    >
      {src ? (
        <img
          src={src}
          alt="TheOutHaven"
          width={Math.max(1, size - 6)}
          height={Math.max(1, size - 6)}
          className="h-[78%] w-[78%] rounded-full object-contain"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span className="text-[10px] font-black leading-none text-red-50" aria-hidden="true">
          H
        </span>
      )}
    </span>
  );
}
