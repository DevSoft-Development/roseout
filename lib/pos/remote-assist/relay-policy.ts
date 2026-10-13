export type RelayRole = "device" | "viewer";
export type RelayChannel = "signaling" | "pointer";
export type RelayGrant = {sessionId:string;locationId:string;deviceId:string;principalId:string;role:RelayRole;channels:readonly RelayChannel[];issuedAt:number;expiresAt:number;sessionVersion:number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const RELAY_MAX_GRANT_MS=60000;
export function authorizeRelayGrant(input:{grant:RelayGrant;session:{id:string;locationId:string;deviceId:string;state:string;version:number;consentExpiresAt:string|null;approvedBy:string|null;endedAt:string|null};principalId:string;role:RelayRole;channel:RelayChannel;locationPermission:boolean;deviceAssigned:boolean;now:number}):boolean{
 const {grant:g,session:s}=input;
 if(![g.sessionId,g.locationId,g.deviceId,g.principalId,input.principalId].every(x=>UUID.test(x)))return false;
 if(!input.locationPermission||!input.deviceAssigned||s.state!=="active"||s.endedAt||!s.approvedBy)return false;
 if(g.sessionId!==s.id||g.locationId!==s.locationId||g.deviceId!==s.deviceId||g.sessionVersion!==s.version)return false;
 if(g.principalId!==input.principalId||g.role!==input.role||!g.channels.includes(input.channel))return false;
 if(!Number.isFinite(g.issuedAt)||!Number.isFinite(g.expiresAt)||g.issuedAt>input.now||g.expiresAt<=input.now||g.expiresAt-g.issuedAt>RELAY_MAX_GRANT_MS||g.expiresAt<=g.issuedAt)return false;
 const consentEnd=Date.parse(s.consentExpiresAt??"");
 return Number.isFinite(consentEnd)&&consentEnd>input.now&&g.expiresAt<=consentEnd;
}
export type PointerAnnotation={x:number;y:number;kind:"pointer"|"highlight";sequence:number};
export function validatePointerAnnotation(a:PointerAnnotation):boolean{
 return Number.isFinite(a.x)&&a.x>=0&&a.x<=1&&Number.isFinite(a.y)&&a.y>=0&&a.y<=1&&Number.isSafeInteger(a.sequence)&&a.sequence>=0&&(a.kind==="pointer"||a.kind==="highlight");
}
