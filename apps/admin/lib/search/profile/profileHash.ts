import type { LocationSearchProfile } from "./profileTypes";

function stable(value: object): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

/** Portable deterministic FNV-1a hash; profile identity is not a security token. */
export function profileHash(profile: Omit<LocationSearchProfile, "profileHash" | "generatedAt">): string {
  const input = stable(profile);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
