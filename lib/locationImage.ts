export function getLocationImage(location: any) {
  return (
    location?.main_image ||
    location?.image_url ||
    (Array.isArray(location?.images) ? location.images[0] : null) ||
    "/placeholder.jpg"
  );
}
