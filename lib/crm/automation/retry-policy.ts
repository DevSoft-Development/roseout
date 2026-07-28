import "server-only";
export const RETRY_DELAYS_MS=[0,5*60_000,30*60_000,2*60*60_000] as const;
export function nextRetryAt(attempt:number,now=new Date(),maxAttempts=4):Date|null { if(attempt>=Math.min(maxAttempts,RETRY_DELAYS_MS.length)) return null; return new Date(now.getTime()+RETRY_DELAYS_MS[attempt]); }

