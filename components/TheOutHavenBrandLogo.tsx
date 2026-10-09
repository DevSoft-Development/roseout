"use client";

import { useState } from "react";

type TheOutHavenBrandLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  label?: string;
};

/** Shared across separately deployed surfaces; the image asset must ship with each app. */
export default function TheOutHavenBrandLogo({
  className = "h-auto w-[190px] max-w-full object-contain",
  width = 600,
  height = 200,
  label,
}: TheOutHavenBrandLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className="inline-flex min-w-0 max-w-full flex-col">
      {!imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/toh_logo_wordmark_white.webp"
          alt="TheOutHaven"
          width={width}
          height={height}
          className={className}
          loading="eager"
          decoding="async"
          onError={() => setImageFailed(true)}
          onLoad={(event) => {
            if (!event.currentTarget.naturalWidth || !event.currentTarget.naturalHeight) {
              setImageFailed(true);
            }
          }}
        />
      ) : (
        <span role="img" aria-label="TheOutHaven" className="inline-block text-xl font-black tracking-tight text-white">
          <span className="text-white/75">The</span>
          <span className="text-[#e1062a]">Out</span>
          <span>Haven</span>
        </span>
      )}
      {label ? (
        <span className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-white/60">{label}</span>
      ) : null}
    </span>
  );
}
