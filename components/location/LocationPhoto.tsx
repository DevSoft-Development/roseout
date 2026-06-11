"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

function isUsableImageSrc(value?: string | null) {
  const src = String(value || "").trim();
  const lower = src.toLowerCase();

  if (!src) return false;
  if (src.length <= 8) return false;
  if (
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "missing",
      "no image",
      "no-image",
      "photo coming soon",
      "coming soon",
      "#",
      "?",
    ].includes(lower)
  ) {
    return false;
  }
  if (
    lower.includes("placeholder") ||
    lower.includes("default-image") ||
    lower.includes("photo-coming-soon")
  ) {
    return false;
  }

  if (src.startsWith("/")) return src.length > 1;
  if (src.startsWith("data:image/")) return true;
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
  fallbackLabel = "Photo Coming Soon",
}: {
  src?: string | null;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  fallbackLabel?: string;
}) {
  const resolvedImageUrl = useMemo(() => {
    const cleaned = String(src || "").trim();
    return isUsableImageSrc(cleaned) ? cleaned : null;
  }, [src]);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const canRenderImage =
    Boolean(resolvedImageUrl) && failedSrc !== resolvedImageUrl;
  const isGooglePlacesPhoto = Boolean(
    resolvedImageUrl?.includes("maps.googleapis.com/maps/api/place/photo"),
  );

  if (!canRenderImage) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),rgba(0,0,0,0.92)_58%)] ${className}`}
        aria-label={fallbackLabel}
      >
        <div className="px-5 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#e1062a]/35 bg-black/70 shadow-[0_0_24px_rgba(225,6,42,0.22)]">
            <Image
              src="/toh_logo.png"
              alt="TheOutHaven"
              width={34}
              height={34}
              unoptimized
              className="h-8 w-8 object-contain"
            />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            {fallbackLabel}
          </p>
        </div>
      </div>
    );
  }

  if (isGooglePlacesPhoto) {
    return (
      <>
        {/* Google Places photo endpoints are intentionally rendered with a native img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedImageUrl || undefined}
          alt={alt || "Location photo"}
          loading={priority ? "eager" : "lazy"}
          onError={() => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[LocationPhoto] failed to load image",
                resolvedImageUrl,
              );
            }
            setFailedSrc(resolvedImageUrl);
          }}
          className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.06] ${className}`}
        />
      </>
    );
  }

  return (
    <Image
      src={resolvedImageUrl || ""}
      alt={alt || "Location photo"}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      onError={() => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[LocationPhoto] failed to load image",
            resolvedImageUrl,
          );
        }
        setFailedSrc(resolvedImageUrl);
      }}
      className={`object-cover transition duration-700 group-hover:scale-[1.06] ${className}`}
    />
  );
}
