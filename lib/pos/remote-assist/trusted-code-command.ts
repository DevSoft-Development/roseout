import type {AssistAuthenticatedIdentity,AssistDeviceScope,AssistPrivilegedDatabase} from "./trusted-database-port";
import {authorizedTechnicianScope} from "./trusted-database-port";
export type CodeResult={ok:true}|{ok:false;reason:"forbidden"|"invalid"|"expired"|"locked"|"unavailable"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Server-only command: identity is derived from authenticated session, not request body.
 * Caller must supply an implementation enforcing database tenant policy. */
export async function redeemAuthorizedCode(input:{
 identity:AssistAuthenticatedIdentity;db:AssistPrivilegedDatabase;scope:AssistDeviceScope;
 digest:string;
}):Promise<CodeResult>{
 const {scope,digest}=input;
 if(![scope.sessionId,scope.locationId,scope.deviceId].every(v=>uuid.test(v))||
 !/^[a-f0-9]{64}$/i.test(digest))return {ok:false,reason:"invalid"};
 const principal=await authorizedTechnicianScope(input.identity,scope);
 if(!principal)return {ok:false,reason:"forbidden"};
 try{
  const result=await input.db.redeemCodeAndCreateProof(principal,digest);
  return result==="accepted"?{ok:true}:{ok:false,reason:result==="expired"?"expired":result==="locked"?"locked":"forbidden"};
 }catch{return {ok:false,reason:"unavailable"};}
}
