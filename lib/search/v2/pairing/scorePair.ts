export function scorePair(restaurant: number, activity: number, distance: number, mlBoost = 0) { return restaurant * .4 + activity * .4 + distance * .2 + Math.min(5, Math.max(0, mlBoost)); }
