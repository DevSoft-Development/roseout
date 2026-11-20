/** Customer Text-to-Pay acknowledgment adds evidence; it never replaces cardholder authentication. */
export type CheckoutVerificationMode="standard"|"customer_screen"|"text_to_pay";
export type VerificationPolicy={
 enabled:boolean;
 qrThresholdCents:number;
 customerScreenThresholdCents:number;
};
export const DEFAULT_VERIFICATION_POLICY:VerificationPolicy={
 enabled:false,qrThresholdCents:100000,customerScreenThresholdCents:25000
};
export function chooseCheckoutVerification(totalCents:number,policy:VerificationPolicy):CheckoutVerificationMode{
 if(!Number.isSafeInteger(totalCents)||totalCents<=0)throw Error("invalid_payment_total");
 if(!policy.enabled)return "standard";
 if(!Number.isSafeInteger(policy.qrThresholdCents)||policy.qrThresholdCents<100||
  !Number.isSafeInteger(policy.customerScreenThresholdCents)||policy.customerScreenThresholdCents<100||
  policy.qrThresholdCents<policy.customerScreenThresholdCents)throw Error("invalid_verification_policy");
 if(totalCents>=policy.qrThresholdCents)return "text_to_pay";
 if(totalCents>=policy.customerScreenThresholdCents)return "customer_screen";
 return "standard";
}
