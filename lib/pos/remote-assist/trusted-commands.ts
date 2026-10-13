import type {AssistAuthenticatedIdentity,AssistDeviceScope,AssistPrivilegedDatabase} from "./trusted-database-port";
import {authorizedTechnicianScope,authorizedDeviceScope} from "./trusted-database-port";
export type AssistCommandResult={ok:true}|{ok:false;reason:"forbidden"|"invalid"|"unavailable"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function valid(scope:AssistDeviceScope){return [scope.sessionId,scope.locationId,scope.deviceId].every(v=>uuid.test(v));}
export async function activateAuthorizedAssist(input:{
 identity:AssistAuthenticatedIdentity;db:AssistPrivilegedDatabase;scope:AssistDeviceScope;expectedVersion:number;
}):Promise<AssistCommandResult>{
 if(!valid(input.scope)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)return {ok:false,reason:"invalid"};
 const scope=await authorizedTechnicianScope(input.identity,input.scope);
 if(!scope)return {ok:false,reason:"forbidden"};
 try{return await input.db.activateWithProofs(scope,input.expectedVersion)?{ok:true}:{ok:false,reason:"forbidden"};}
 catch{return {ok:false,reason:"unavailable"};}
}
export async function attestAuthorizedCapture(input:{
 identity:AssistAuthenticatedIdentity;db:AssistPrivilegedDatabase;scope:AssistDeviceScope;
 attestationId:string;approvedAt:Date;expiresAt:Date;
}):Promise<AssistCommandResult>{
 if(!valid(input.scope)||!uuid.test(input.attestationId)||!Number.isFinite(input.approvedAt.getTime())||
 !Number.isFinite(input.expiresAt.getTime())||input.expiresAt.getTime()<=input.approvedAt.getTime()||
 input.expiresAt.getTime()-input.approvedAt.getTime()>120_000)return {ok:false,reason:"invalid"};
 const scope=await authorizedDeviceScope(input.identity,input.scope);
 if(!scope)return {ok:false,reason:"forbidden"};
 try{await input.db.recordCaptureAttestation(scope,input.attestationId,input.approvedAt,input.expiresAt);return {ok:true};}
 catch{return {ok:false,reason:"unavailable"};}
}
