import { mayAssist, type AssistAction, type AssistPlatform, type AssistState } from "./capabilities";
export type AssistSession = {
 id:string; locationId:string; deviceId:string; requestedBy:string; approvedBy:string|null;
 platform:AssistPlatform; state:AssistState; createdAt:string; consentExpiresAt:string|null;
 endedAt:string|null; version:number;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validAssistId(value:unknown):value is string {return typeof value==="string"&&UUID.test(value);}
export function authorizeAssistCommand(input:{
 session:AssistSession; locationId:string; deviceId:string; technicianId:string;
 permissionGranted:boolean; assignedToLocation:boolean; action:AssistAction; now?:number;
}):boolean{
 const s=input.session;
 if (![s.id,s.locationId,s.deviceId,s.requestedBy].every(validAssistId)) return false;
 if (s.locationId!==input.locationId || s.deviceId!==input.deviceId) return false;
 if (s.requestedBy!==input.technicianId || !input.permissionGranted) return false;
 if (s.endedAt || s.version<1) return false;
 if (["screen_share","device_sync","rediscover","refresh_config"].includes(input.action) && !validAssistId(s.approvedBy)) return false;
 return mayAssist({
  platform:s.platform,action:input.action,authorized:true,
  assigned:input.assignedToLocation,state:s.state,
  expiresAt:s.consentExpiresAt,now:input.now
 });
}
export function isValidSessionTransition(before:AssistSession,after:AssistSession):boolean {
 if(before.id!==after.id || before.locationId!==after.locationId ||
 before.deviceId!==after.deviceId || before.platform!==after.platform ||
 before.requestedBy!==after.requestedBy || after.version!==before.version+1) return false;
 const transitions:Record<AssistState,AssistState[]>={
 requested:["approved","revoked","expired"],approved:["active","revoked","expired","ended"],
 active:["revoked","expired","ended"],revoked:[],expired:[],ended:[]
 };
 if(!transitions[before.state].includes(after.state))return false;
 if(after.state==="approved" && (!validAssistId(after.approvedBy) || after.approvedBy===after.requestedBy || !after.consentExpiresAt || !Number.isFinite(Date.parse(after.consentExpiresAt)) || Date.parse(after.consentExpiresAt)<=Date.parse(after.createdAt) || Date.parse(after.consentExpiresAt)-Date.parse(after.createdAt)>15*60_000))return false;
 if(["approved","active"].includes(after.state) && (!validAssistId(after.approvedBy) || !after.consentExpiresAt))return false;
 if(["revoked","expired","ended"].includes(after.state) && !after.endedAt)return false;
 return true;
}
