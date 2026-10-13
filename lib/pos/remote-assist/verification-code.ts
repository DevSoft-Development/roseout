import {createHmac, randomInt, timingSafeEqual} from "node:crypto";

/** Store only HMAC digests; secret must come from a centralized server vault. */
export type AssistCodeRecord = {
 sessionId:string; locationId:string; deviceId:string; technicianId:string;
 digest:string; expiresAt:number; attempts:number; consumedAt:number|null;
};
export type AssistCodeStore = {
 issue(record:AssistCodeRecord):Promise<void>;
 /** Atomic lock/compare-and-update; prevents replay and concurrent redemption. */
 redeem(input:{sessionId:string;locationId:string;deviceId:string;technicianId:string;
  digest:string;now:number;maxAttempts:number}):Promise<"accepted"|"rejected"|"locked"|"expired">;
};
function digest(secret:string,record:Pick<AssistCodeRecord,"sessionId"|"locationId"|"deviceId"|"technicianId">,code:string):string {
 return createHmac("sha256",secret).update([record.sessionId,record.locationId,record.deviceId,record.technicianId,code].join(":")).digest("hex");
}
export function issueAssistCode(input:{
 secret:string;sessionId:string;locationId:string;deviceId:string;technicianId:string;
 store:AssistCodeStore;now:number;
}):Promise<string> {
 if(input.secret.length<32)throw Error("verification secret not configured");
 const code=String(randomInt(0,1_000_000)).padStart(6,"0");
 const record:AssistCodeRecord={sessionId:input.sessionId,locationId:input.locationId,
 deviceId:input.deviceId,technicianId:input.technicianId,
 digest:digest(input.secret,input,code),expiresAt:input.now+120_000,attempts:0,consumedAt:null};
 return input.store.issue(record).then(()=>code);
}
export async function redeemAssistCode(input:{
 secret:string;sessionId:string;locationId:string;deviceId:string;technicianId:string;
 code:string;store:AssistCodeStore;now:number;
}):Promise<boolean> {
 if(input.secret.length<32||!/^[0-9]{6}$/.test(input.code))return false;
 const value=digest(input.secret,input,input.code);
 const result=await input.store.redeem({...input,digest:value,maxAttempts:5});
 return result==="accepted";
}
/** Safe digest comparison for implementations that must compare in application code. */
export function compareAssistCodeDigests(a:string,b:string):boolean {
 if(!/^[a-f0-9]{64}$/i.test(a)||!/^[a-f0-9]{64}$/i.test(b))return false;
 return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
