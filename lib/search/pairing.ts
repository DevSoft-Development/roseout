import { haversineMiles, walkingMinutesFromMiles } from './distance';
import type { ScoredPair, SearchLocation } from './types';

export function pairLocations(restaurants:SearchLocation[], activities:SearchLocation[], maxWalkingMiles=1.25){
  const pairs:ScoredPair[]=[];
  for (const r of restaurants){
    for (const a of activities){
      if (!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)||!Number.isFinite(a.latitude)||!Number.isFinite(a.longitude)) continue;
      const distanceMiles=haversineMiles(r.latitude as number,r.longitude as number,a.latitude as number,a.longitude as number);
      if (distanceMiles>maxWalkingMiles) continue;
      pairs.push({restaurant:r,activity:a,distanceMiles,walkingMinutes:walkingMinutesFromMiles(distanceMiles),score:0});
    }
  }
  return pairs;
}
