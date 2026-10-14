import {createHash,randomBytes,timingSafeEqual} from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export type TextToPaySnapshot={
 locationId:string;checkId:string;tenderId:string;amountCents:number;
 currency:string;agreementSha256:string;expiresAt:string;
};
/** No PII or payment credential is encoded in the URL. Store only token hashes. */
export function issueTextToPayChallenge(subject:TextToPaySnapshot,now=Date.now()){
 if(![subject.locationId,subject.checkId,subject.tenderId].every(x=>UUID.test(x))||
  !Number.isSafeInteger(subject.amountCents)||subject.amountCents<1||
  !/^[a-z]{3}$/.test(subject.currency)||!/^[a-f0-9]{64}$/.test(subject.agreementSha256))
  throw Error("invalid_text_to_pay_snapshot");
 const expiration=Date.parse(subject.expiresAt);
 if(!Number.isFinite(expiration)||expiration<=now||expiration>now+10*60_000)
  throw Error("invalid_text_to_pay_expiry");
 const token=randomBytes(32).toString("base64url");
 return {token,tokenHash:hashTextToPayToken(token),snapshot:subject};
}
export function hashTextToPayToken(token:string){
 if(!TOKEN.test(token))throw Error("invalid_text_to_pay_token");
 return createHash("sha256").update(token,"utf8").digest("hex");
}
export function matchTextToPayToken(token:string,expectedHash:string){
 if(!/^[a-f0-9]{64}$/.test(expectedHash))return false;
 const actual=Buffer.from(hashTextToPayToken(token),"hex");
 return timingSafeEqual(actual,Buffer.from(expectedHash,"hex"));
}
