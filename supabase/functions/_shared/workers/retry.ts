export function retryDelaySeconds(attempt: number) { return Math.min(3600, Math.max(30, 2 ** Math.max(0, attempt - 1) * 30)); }
