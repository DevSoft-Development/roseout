export type AssistPlatform = "android" | "ipados" | "linux";
export type AssistAction = "diagnostics" | "rediscover" | "refresh_config" | "request_share" | "screen_share" | "device_sync" | "remote_touch" | "reboot";
export type AssistState = "requested" | "approved" | "active" | "revoked" | "expired" | "ended";
export const ASSIST_MAX_CONSENT_MS = 15 * 60_000;
const capabilities: Record<AssistPlatform, readonly AssistAction[]> = {
 android: ["diagnostics","rediscover","refresh_config","request_share","screen_share","device_sync"],
 linux: ["diagnostics","rediscover","refresh_config","request_share","screen_share","device_sync"],
 ipados: ["diagnostics","rediscover","refresh_config","request_share","screen_share","device_sync"]
};
export const assistActionsFor = (platform: AssistPlatform) => capabilities[platform];
export function mayAssist(input: {platform:AssistPlatform; action:AssistAction; authorized:boolean; assigned:boolean; state:AssistState; expiresAt?:string|null; now?:number}) {
 if (!input.authorized || !input.assigned || !capabilities[input.platform]?.includes(input.action)) return false;
 if (["ended","revoked","expired"].includes(input.state)) return false;
 if (input.action === "diagnostics") return true;
 if (input.action === "request_share") return input.state === "requested";
 if (!["approved","active"].includes(input.state)) return false;
 const now = input.now ?? Date.now(), expiry = Date.parse(input.expiresAt || "");
 return Number.isFinite(expiry) && expiry > now && expiry - now <= ASSIST_MAX_CONSENT_MS;
}
export function redactAssistTelemetry(input: Record<string,unknown>):Record<string,unknown> {
 const secret = /password|secret|token|authorization|cookie|key|card|pan|cvv|cvc|pin|track|email|phone/i;
 const clean = (v:unknown):unknown => Array.isArray(v) ? v.map(clean) :
   v && typeof v==="object" ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,secret.test(k)?"[REDACTED]":clean(x)])) : v;
 return clean(input) as Record<string,unknown>;
}
