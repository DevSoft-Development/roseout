/**
 * Paid task single-flight boundary. Claim must be a durable atomic compare-and-swap.
 * An uncertain provider outcome is never retried by this function.
 */
export async function executeSingleFlightReviewTask<T>(input: {
  claim: () => Promise<boolean>;
  post: () => Promise<T>;
  persist: (result:T) => Promise<void>;
  quarantine: (reason:string) => Promise<void>;
}):Promise<{status:"already_claimed"|"submitted"|"submission_unknown";result?:T}> {
  if(!await input.claim())return {status:"already_claimed"};
  try{
    const result=await input.post();
    await input.persist(result);
    return {status:"submitted",result};
  }catch(error){
    await input.quarantine(error instanceof Error?error.message:"unknown_paid_submission");
    return {status:"submission_unknown"};
  }
}
