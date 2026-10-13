import {createHmac} from "node:crypto";
import type {AssistAuthenticatedIdentity,AssistDeviceScope,AssistPrivilegedDatabase} from "./trusted-database-port";
import {authorizedTechnicianScope} from "./trusted-database-port";
export type CodeResult={ok:true}|{ok:false;reason:"forbidden"|"invalid"|"expired"|"locked"|"unavailable"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The client submits the six-digit code, NEVER a precomputed HMAC digest.
 * HMAC is computed exclusively on the trusted server using its vault secret.
 * The technician principal is resolved from authenticated server identity.
 */
export async function redeemAuthorizedCode(input:{
 identity:AssistAuthenticatedIdentity;db:AssistPrivilegedDatabase;scope:AssistDeviceScope;
 code:string;secret:string;
}):Promise<CodeResult>{
 const {scope,code,secret}=input;
 if(![scope.sessionId,scope.locationId,scope.deviceId].every(v=>uuid.test(v))||
 !/^[0-9]{6}$/.test(code)||secret.length<32)return {ok:false,reason:"invalid"};
 const principal=await authorizedTechnicianScope(input.identity,scope);
 if(!principal)return {ok:false,reason:"forbidden"};
 const digest=createHmac("sha256",secret)
  .update([scope.sessionId,scope.locationId,scope.deviceId,principal.technicianId,code].join(":"))
  .digest("hex");
 try{
  const result=await input.db.redeemCodeAndCreateProof(principal,digest);
  return result==="accepted"?{ok:true}:{ok:false,reason:result==="expired"?"expired":result==="locked"?"locked":"forbidden"};
 }catch{return {ok:false,reason:"unavailable"};}
}
