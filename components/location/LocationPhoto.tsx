"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

function isUsableImageSrc(value?: string | null) {
  const src = String(value || "").trim();
  const lower = src.toLowerCase();

  if (!src) return false;
  if (
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "missing",
      "no image",
      "no-image",
      "#",
      "?",
    ].includes(lower)
  ) {
    return false;
  }
  if (lower.includes("placeholder") || lower.includes("default-image")) {
    return false;
  }

  if (src.startsWith("/")) return src.length > 1;
  if (src.startsWith("http://")) return src.length > "http://".length;
  if (src.startsWith("https://")) return src.length > "https://".length;

  return false;
}

export default function LocationPhoto({
  src,
  alt,
  priority = false,
  className = "",
  sizes = "(max-width: 768px) 100vw, 33vw",
  fallbackLabel = "Photo coming soon",
}: {
  src?: string | null;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  fallbackLabel?: string;
}) {
  const cleanedSrc = useMemo(() => String(src || "").trim(), [src]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [cleanedSrc]);

  const canRenderImage = isUsableImageSrc(cleanedSrc) && !failed;

  if (!canRenderImage) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),rgba(0,0,0,0.92)_58%)] ${className}`}
        aria-label={fallbackLabel}
      >
        <div className="px-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[#e1062a]/35 bg-[#e1062a]/10 text-sm font-black text-[#e1062a]">
            TOH
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            {fallbackLabel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={cleanedSrc}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      onError={() => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[LocationPhoto] failed to load image", cleanedSrc);
        }
        setFailed(true);
      }}
      className={`object-cover transition duration-700 group-hover:scale-[1.06] ${className}`}
    />
  );
}
