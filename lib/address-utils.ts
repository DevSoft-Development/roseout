export function cleanAddressPart(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripCityStateZipFromAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
) {
  let street = cleanAddressPart(address);
  const cleanCity = cleanAddressPart(city);
  const cleanState = cleanAddressPart(state);
  const cleanZip = cleanAddressPart(zip);

  if (!street) return "";

  const suffixes = [
    [cleanCity, cleanState, cleanZip],
    [cleanCity, cleanState],
    [cleanState, cleanZip],
    [cleanCity, cleanZip],
    [cleanZip],
    [cleanState],
    [cleanCity],
  ]
    .map((parts) => parts.filter(Boolean))
    .filter((parts) => parts.length > 0);

  for (const parts of suffixes) {
    const pattern = parts
      .map((part) => escapeRegExp(part))
      .join("\\s*,?\\s*");

    street = street.replace(
      new RegExp(`\\s*,?\\s*${pattern}\\s*$`, "i"),
      "",
    );
  }

  return street.replace(/\s*,\s*$/, "").trim();
}

export function formatFullAddress({
  address,
  city,
  state,
  zip,
  zip_code,
  fallback = "Address not listed",
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
  fallback?: string;
}) {
  const cleanCity = cleanAddressPart(city);
  const cleanState = cleanAddressPart(state);
  const cleanZip = cleanAddressPart(zip_code || zip);
  const street = stripCityStateZipFromAddress(
    address,
    cleanCity,
    cleanState,
    cleanZip,
  );

  const cityStateZip = [cleanCity, cleanState, cleanZip]
    .filter(Boolean)
    .join(", ");

  return [street, cityStateZip].filter(Boolean).join(", ") || fallback;
}

export function normalizeAddressForSave({
  address,
  city,
  state,
  zip,
  zip_code,
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip_code?: string | null;
}) {
  return stripCityStateZipFromAddress(
    address,
    city,
    state,
    zip_code || zip,
  );
}
