/** Fail-closed check: a venue-level Google ID is not a business identity. */
export function matchesIndependentBusiness(
  candidate: {name?:string; address?:string},
  place: {displayName?:{text?:string}; formattedAddress?:string; id?:string},
  expectedId:string,
): boolean {
  if (place.id !== expectedId) return false;
  const tokens = (s:string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>1));
  const a=tokens(candidate.name||""), b=tokens(place.displayName?.text||"");
  if (!a.size || !b.size) return false;
  const overlap=[...a].filter(t=>b.has(t)).length / Math.max(a.size,b.size);
  // Normalize street abbreviations and require same street number, never just a venue name.
  const street=(s:string)=>s.toLowerCase().replace(/\b(street|st)\b/g,"st").replace(/\b(avenue|ave)\b/g,"ave").replace(/\b(boulevard|blvd)\b/g,"blvd").replace(/[^a-z0-9]/g,"");
  const number=(s:string)=>s.trim().match(/^\d+[a-z]?/)?.[0]?.toLowerCase();
  if(!number(candidate.address||"") || number(candidate.address||"")!==number(place.formattedAddress||""))return false;
  const normalizedStreet=street(candidate.address||"");
  const normalizedGoogle=street((place.formattedAddress||"").split(",")[0]);
  return overlap>=0.7 && normalizedStreet===normalizedGoogle;
}
