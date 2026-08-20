export type EventFeePayer = "customer" | "organizer" | "split";

export const THEOUTHAVEN_PLATFORM_FEE_BPS = 500;
export const STRIPE_CARD_PERCENT_BPS = 290;
export const STRIPE_CARD_FIXED_CENTS = 30;

export function calculateEventFees(ticketSubtotalCents: number, feePayer: EventFeePayer) {
  const subtotal = Math.max(0, Math.round(ticketSubtotalCents));
  const platformFee = Math.round((subtotal * THEOUTHAVEN_PLATFORM_FEE_BPS) / 10000);
  const baseStripeFee = Math.round((subtotal * STRIPE_CARD_PERCENT_BPS) / 10000) + STRIPE_CARD_FIXED_CENTS;

  const buyerShare = feePayer === "customer" ? 1 : feePayer === "split" ? 0.5 : 0;
  const organizerShare = 1 - buyerShare;

  const buyerFee = Math.round((platformFee + baseStripeFee) * buyerShare);
  const organizerFee = Math.round((platformFee + baseStripeFee) * organizerShare);
  const customerTotal = subtotal + buyerFee;
  const organizerNetEstimate = Math.max(0, subtotal - organizerFee);

  return {
    ticketSubtotalCents: subtotal,
    platformFeeCents: platformFee,
    stripeProcessingEstimateCents: baseStripeFee,
    customerServiceFeeCents: buyerFee,
    organizerFeeCents: organizerFee,
    customerTotalCents: customerTotal,
    organizerNetEstimateCents: organizerNetEstimate,
  };
}
