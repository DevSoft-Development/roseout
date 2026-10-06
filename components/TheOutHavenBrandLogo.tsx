"use client";

import { useState } from "react";

type TheOutHavenBrandLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  label?: string;
};

export default function TheOutHavenBrandLogo({
  className = "h-auto w-[190px] max-w-full object-contain",
  width = 600,
  height = 200,
  label,
}: TheOutHavenBrandLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className="inline-flex min-w-0 flex-col">
      {!imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/toh_logo_wordmark_white_20261006.webp"
          alt="TheOutHaven"
          width={width}
          height={height}
          className={className}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-xl font-black tracking-tight text-white" aria-label="TheOutHaven">
          <span className="text-white/75">The</span>
          <span className="text-[#e1062a]">Out</span>
          <span className="text-white">Haven</span>
        </span>
      )}
      {label ? (
        <span className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-white/40">
          {label}
        </span>
      ) : null}
    </span>
  );
}
