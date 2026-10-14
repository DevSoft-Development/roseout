import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type Claims={v:1;locationId:string;checkId:string;tenderId:string;deviceId:string;nonce:string;issuedAt:number;expiresAt:number;purpose:"customer_signature"};
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const key=()=>{const secret=process.env.POS_CUSTOMER_SIGNATURE_SESSION_SECRET||"";if(secret.length<48)throw new Error("signature_session_key_missing");return secret;};
const sign=(encoded:string)=>createHmac("sha256",key()).update(encoded).digest("base64url");
export function issueCustomerEvidenceSession(input:{locationId:string;checkId:string;tenderId:string;deviceId:string}){
  if(![input.locationId,input.checkId,input.tenderId].every(x=>UUID.test(x))||!input.deviceId.trim())throw new Error("invalid_customer_session_subject");
  const issuedAt=Date.now();
  const claims:Claims={v:1,...input,nonce:randomUUID(),issuedAt,expiresAt:issuedAt+120_000,purpose:"customer_signature"};
  const encoded=Buffer.from(JSON.stringify(claims)).toString("base64url");
  return encoded+"."+sign(encoded);
}
export function verifyCustomerEvidenceSession(token:string,expected:{locationId:string;checkId:string;tenderId:string;deviceId:string}){
  if(token.length>2048)throw new Error("invalid_signature_session");
  const parts=token.split(".");
  if(parts.length!==2)throw new Error("invalid_signature_session");
  const mac=Buffer.from(parts[1],"base64url"),correct=Buffer.from(sign(parts[0]),"base64url");
  if(mac.length!==correct.length||!timingSafeEqual(mac,correct))throw new Error("invalid_signature_session");
  const claims=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as Claims;
  if(claims.v!==1||claims.purpose!=="customer_signature"||claims.expiresAt<Date.now()||
     claims.issuedAt>Date.now()+5000||claims.expiresAt-claims.issuedAt>120_000 ||
     Object.entries(expected).some(([field,value])=>claims[field as keyof Claims]!==value))
    throw new Error("invalid_signature_session");
  return claims;
}
// IMPORTANT: issuer is intentionally not exposed as an HTTP route.
// Future trusted-device issuance must authenticate the device, verify settled
// provider status and consume nonce atomically in shard storage.
