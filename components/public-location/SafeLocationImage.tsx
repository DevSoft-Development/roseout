"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type SafeLocationImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackType?: "hide" | "placeholder";
  priority?: boolean;
  sizes?: string;
};

function isUsableImageSrc(value?: string | null) {
  const src = String(value || "").trim();
  if (!src) return false;
  const lower = src.toLowerCase();
  if (["null", "undefined", "none", "n/a", "missing", "no image", "no-image", "#", "?"].includes(lower)) return false;
  if (lower.includes("placeholder") || lower.includes("default-image")) return false;
  return src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://");
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
  const cleanedSrc = String(src || "").trim();

  useEffect(() => {
    setFailed(false);
  }, [cleanedSrc]);

  if (!isUsableImageSrc(cleanedSrc) || failed) {
    return <BrandedFallback className={className} hidden={fallbackType === "hide"} />;
  }

  return (
    <img
      src={cleanedSrc}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      className={`h-full w-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
