import type { PublicSearchResponseV2 } from "./responseTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateMatchReasonDetails(value: unknown, path: string, errors: string[]) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const allowedTypes = new Set(["cuisine","activity","location","occasion","price","hours","distance","walking","feature","other"]);
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) {
      errors.push(`${path}[${index}] must be an object`);
      continue;
    }
    if (!allowedTypes.has(String(item.type ?? ""))) errors.push(`${path}[${index}].type is invalid`);
    if (typeof item.label !== "string" || !item.label.trim()) errors.push(`${path}[${index}].label must be a non-empty string`);
    if (!["search_evidence","pairing"].includes(String(item.source ?? ""))) errors.push(`${path}[${index}].source is invalid`);
    if (!["high","medium"].includes(String(item.confidence ?? ""))) errors.push(`${path}[${index}].confidence is invalid`);
  }
}

function validateLocation(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.id !== "string" || !value.id.trim()) errors.push(`${path}.id must be a non-empty string`);
  if (value.matchReasons != null && !isStringArray(value.matchReasons)) errors.push(`${path}.matchReasons must be a string array`);
  validateMatchReasonDetails(value.matchReasonDetails, `${path}.matchReasonDetails`, errors);
}

export function validatePublicSearchResponse(response: unknown): asserts response is PublicSearchResponseV2 {
  const errors: string[] = [];
  if (!isRecord(response)) throw new Error("PUBLIC_SEARCH_RESPONSE_INVALID:response must be an object");

  if (response.version !== "public-search-v2") errors.push("version must be public-search-v2");
  if (typeof response.success !== "boolean") errors.push("success must be boolean");
  if (typeof response.requestId !== "string" || !response.requestId) errors.push("requestId must be a non-empty string");
  if (!isRecord(response.searchPlan)) errors.push("searchPlan must be an object");
  if (!isRecord(response.counts)) errors.push("counts must be an object");
  if (!isRecord(response.fallback)) errors.push("fallback must be an object");
  if (!isRecord(response.retrieval)) errors.push("retrieval must be an object");

  for (const key of ["restaurants", "activities", "sameVenueResults"] as const) {
    const value = response[key];
    if (!Array.isArray(value)) errors.push(`${key} must be an array`);
    else value.forEach((item, index) => validateLocation(item, `${key}[${index}]`, errors));
  }

  if (!Array.isArray(response.pairs)) errors.push("pairs must be an array");
  else response.pairs.forEach((pair, index) => {
    if (!isRecord(pair)) errors.push(`pairs[${index}] must be an object`);
    else {
      validateLocation(pair.restaurant, `pairs[${index}].restaurant`, errors);
      validateLocation(pair.activity, `pairs[${index}].activity`, errors);
      validateMatchReasonDetails(pair.matchReasonDetails, `pairs[${index}].matchReasonDetails`, errors);
    }
  });

  if (!isRecord(response.builder) || !Array.isArray(response.builder.restaurants) || !Array.isArray(response.builder.activities)) {
    errors.push("builder must contain restaurant and activity arrays");
  }

  if (errors.length) throw new Error(`PUBLIC_SEARCH_RESPONSE_INVALID:${errors.join(";")}`);
}
