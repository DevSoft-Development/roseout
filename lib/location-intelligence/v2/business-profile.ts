import "server-only";

type BusinessProfileMatchInput = {
  name: string;
  googlePlaceId?: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function dataForSeoBusinessItems(data: unknown) {
  const root = asObject(data);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const items: Record<string, unknown>[] = [];

  for (const taskValue of tasks) {
    const task = asObject(taskValue);
    const results = Array.isArray(task?.result) ? task.result : [];
    for (const resultValue of results) {
      const result = asObject(resultValue);
      const resultItems = Array.isArray(result?.items) ? result.items : [];
      for (const itemValue of resultItems) {
        const item = asObject(itemValue);
        if (item) items.push(item);
      }
    }
  }

  return items;
}

export function selectDataForSeoBusinessProfile(
  data: unknown,
  input: BusinessProfileMatchInput,
) {
  const items = dataForSeoBusinessItems(data);
  if (!items.length) return null;

  const placeId = String(input.googlePlaceId || "").trim();
  if (placeId) {
    const byPlace = items.filter((item) => String(item.place_id || "").trim() === placeId);
    if (byPlace.length === 1) return byPlace[0];
    if (byPlace.length > 1) return null;
  }

  const expectedName = normalizeName(input.name);
  if (!expectedName) return null;

  const exactTitleMatches = items.filter(
    (item) => normalizeName(item.title || item.original_title) === expectedName,
  );
  return exactTitleMatches.length === 1 ? exactTitleMatches[0] : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonEmptyString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

export function canonicalFieldsFromDataForSeoBusinessProfile(item: unknown) {
  const profile = asObject(item);
  if (!profile) return {};

  const fields: Record<string, unknown> = {};
  const phone = nonEmptyString(profile.phone);
  const website = nonEmptyString(profile.url);
  const description = nonEmptyString(profile.description);
  const mainImage = nonEmptyString(profile.main_image);
  const category = slugify(profile.category);
  const latitude = finiteNumber(profile.latitude);
  const longitude = finiteNumber(profile.longitude);
  const workTime = asObject(profile.work_time);
  const rating = asObject(profile.rating);
  const ratingValue = finiteNumber(rating?.value);
  const votesCount = finiteNumber(rating?.votes_count);

  if (phone) fields.phone = phone;
  if (website && /^https?:\/\//i.test(website)) fields.website = website;
  if (description) fields.description = description;
  if (mainImage && /^https?:\/\//i.test(mainImage)) {
    fields.main_image = mainImage;
    fields.image_url = mainImage;
  }
  if (category) fields.primary_category = category;
  if (latitude != null && latitude >= -90 && latitude <= 90) fields.latitude = latitude;
  if (longitude != null && longitude >= -180 && longitude <= 180) fields.longitude = longitude;
  if (workTime) {
    fields.operating_hours = workTime;
    fields.hours_raw = workTime;
  }
  if (ratingValue != null && ratingValue >= 0 && ratingValue <= 5) fields.rating = ratingValue;
  if (votesCount != null && votesCount >= 0) fields.review_count = Math.trunc(votesCount);

  return fields;
}
