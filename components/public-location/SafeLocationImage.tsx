"use client";

import { useState } from "react";
import LocationImagePlaceholder from "@/components/public-location/LocationImagePlaceholder";

type SafeLocationImageProps = {
  src: string;
  alt: string;
  className?: string;
  fallbackType?: "hide" | "placeholder";
  priority?: boolean;
  sizes?: string;
};

export default function SafeLocationImage({
  src,
  alt,
  className = "",
  fallbackType = "hide",
  priority = false,
}: SafeLocationImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (fallbackType === "placeholder") {
      return <LocationImagePlaceholder label="Photo coming soon" />;
    }

    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      className={`h-full w-full object-cover ${className}`}
      onError={() => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[LocationPhotoGallery] image failed to load", src);
        }
        setFailed(true);
      }}
    />
  );
}
