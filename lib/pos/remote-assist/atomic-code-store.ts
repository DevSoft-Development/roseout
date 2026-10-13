import type {AssistCodeStore} from "./verification-code";

/** Backend adapter must provide a single SQL transaction for redemption and proof creation. */
export type AtomicCodeRedemptionStore=Pick<AssistCodeStore,"issue"> & {
 redeemAndRecordProof(input:{
  sessionId:string;locationId:string;deviceId:string;technicianId:string;
  digest:string;now:number;
 }):Promise<"accepted"|"rejected"|"locked"|"expired">;
};

/** Compatibility adapter intentionally refuses a split redeem/markVerified workflow. */
export function atomicRedemptionStore(store:AtomicCodeRedemptionStore):AssistCodeStore {
 return {
  issue:record=>store.issue(record),
  redeem:async input=>store.redeemAndRecordProof({
   sessionId:input.sessionId,locationId:input.locationId,deviceId:input.deviceId,
   technicianId:input.technicianId,digest:input.digest,now:input.now
  })
 };
}
