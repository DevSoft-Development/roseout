export const WALKING_MINUTES_PER_MILE = 20;
export function estimatedWalkingMinutes(miles: number) { return Math.ceil(miles * WALKING_MINUTES_PER_MILE); }
