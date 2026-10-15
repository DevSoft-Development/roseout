"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type SafeLocationImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackType?: "hide" | "placeholder";
  priority?: boolean;
  sizes?: string;
};

type Attribution = {
  displayName?: string | null;
  uri?: string | null;
  photoUri?: string | null;
};

function isUsableImageSrc(value?: string | null) {
  const src = String(value || "").trim();
  if (!src) return false;
  const lower = src.toLowerCase();
  if (["null", "undefined", "none", "n/a", "missing", "no image", "no-image", "#", "?"].includes(lower)) return false;
  if (lower.includes("placeholder") || lower.includes("default-image")) return false;
  return src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://");
}

function googlePhotoRequest(value: string) {
  try {
    const parsed = new URL(value, "https://theouthaven.com");
    if (!parsed.pathname.includes("/api/public/google-place-photo")) return null;
    const placeId = parsed.searchParams.get("placeId") || parsed.searchParams.get("place_id");
    if (!placeId) return null;
    return {
      placeId,
      index: parsed.searchParams.get("index") || "0",
    };
  } catch {
    return null;
  }
}

function BrandedFallback({ className = "", hidden = false }: { className?: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div
      className={`flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(225,6,42,0.18),rgba(0,0,0,0.92)_58%)] ${className}`}
      aria-label="TheOutHaven branded image fallback"
    >
      <Image src="/toh_logo.png" alt="TheOutHaven" width={56} height={56} unoptimized className="h-14 w-14 object-contain opacity-90" />
    </div>
  );
}

export default function SafeLocationImage({
  src,
  alt,
  className = "",
  fallbackType = "placeholder",
  priority = false,
}: SafeLocationImageProps) {
  const [failed, setFailed] = useState(false);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [googleAvailability, setGoogleAvailability] = useState<"unknown" | "available" | "unavailable">("available");
  const unavailableMarkerRef = useRef<HTMLSpanElement | null>(null);
  const primaryPhotoContainerRef = useRef<HTMLSpanElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const cleanedSrc = String(src || "").trim();
  const googleRequest = useMemo(() => googlePhotoRequest(cleanedSrc), [cleanedSrc]);
  const isLazyGooglePhoto = Boolean(googleRequest && Number(googleRequest.index || 0) > 0);

  useEffect(() => {
    setFailed(false);
    setAttribution(null);
    setGoogleAvailability(isLazyGooglePhoto ? "unknown" : "available");
  }, [cleanedSrc, isLazyGooglePhoto]);

  // Primary search-result photos stay natively lazy and only look up
  // potentially billable Google photo metadata when approaching the viewport.
  // Gallery slots keep their existing availability behavior.
  useEffect(() => {
    if (!googleRequest || isLazyGooglePhoto) return;
    const root=primaryPhotoContainerRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      if (entries.some(entry=>entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    },{rootMargin:"150px"});
    observer.observe(root);
    return ()=>observer.disconnect();
  },[googleRequest,isLazyGooglePhoto]);

  useEffect(() => {
    if (!googleRequest || (!isLazyGooglePhoto && !nearViewport)) return;
    let cancelled = false;
    const params = new URLSearchParams({
      placeId: googleRequest.placeId,
      index: googleRequest.index,
    });
    fetch(`/api/public/google-place-photo/metadata?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return null;
        if (!response.ok) {
          if (isLazyGooglePhoto) setGoogleAvailability("unavailable");
          return null;
        }
        if (isLazyGooglePhoto) setGoogleAvailability("available");
        return response.json();
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        const first = Array.isArray(payload?.attributions) ? payload.attributions[0] : null;
        if (first) setAttribution(first);
      })
      .catch(() => {
        if (!cancelled && isLazyGooglePhoto) setGoogleAvailability("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [googleRequest, isLazyGooglePhoto, nearViewport]);

  useEffect(() => {
    const marker = unavailableMarkerRef.current;
    if (!marker) return;
    const parentButton = marker.closest("button");
    if (!(parentButton instanceof HTMLElement)) return;
    const previousDisplay = parentButton.style.display;
    parentButton.style.display = "none";
    return () => {
      parentButton.style.display = previousDisplay;
    };
  }, [googleAvailability, failed]);

  if (isLazyGooglePhoto && (googleAvailability !== "available" || failed)) {
    return <span ref={unavailableMarkerRef} data-location-photo-unavailable className="hidden" aria-hidden="true" />;
  }

  if (!isUsableImageSrc(cleanedSrc) || failed) {
    return <BrandedFallback className={className} hidden={fallbackType === "hide"} />;
  }

  const sourceHref = attribution?.photoUri || attribution?.uri || null;
  return (
    <span ref={primaryPhotoContainerRef} className="relative block h-full w-full overflow-hidden">
      <img
        src={cleanedSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        className={`h-full w-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
      {googleRequest ? (
        <span className="pointer-events-auto absolute bottom-1.5 left-1.5 max-w-[80%] rounded-full bg-black/72 px-2 py-1 text-[9px] font-bold leading-none text-white/90 backdrop-blur-sm">
          {sourceHref ? (
            <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {attribution?.displayName ? `Photo by ${attribution.displayName} · Google` : "Google photo"}
            </a>
          ) : (
            <span>{attribution?.displayName ? `Photo by ${attribution.displayName} · Google` : "Google photo"}</span>
          )}
        </span>
      ) : null}
    </span>
  );
}
