/** Search V3 evidence coverage: absence of data is not proof of an amenity. */
export type SearchEvidence = {
  identity: boolean; coordinates: boolean; classification: boolean;
  hours: boolean; amenities: boolean; food: boolean; menu: boolean;
  reviews: boolean; experience: boolean; price: boolean;
};
export function searchV3AcquisitionReadiness(x: SearchEvidence) {
  const coreReady = x.identity && x.coordinates && x.classification;
  const lanes = {
    structured: coreReady,
    bm25: x.identity && x.classification,
    dense: x.experience && coreReady,
    food: x.food && coreReady,
    menu: x.menu && coreReady,
    reviews: x.reviews && coreReady,
  };
  const evidenceFields = Object.values(x).filter(Boolean).length;
  return {coreReady,lanes,evidenceFields,totalFields:10,missing:Object.entries(x).filter(([,v])=>!v).map(([k])=>k)};
}
