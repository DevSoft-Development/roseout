export type EventFeePayer = "customer" | "organizer" | "split";

export const THEOUTHAVEN_PLATFORM_FEE_BPS = 300;
export const STRIPE_CARD_PERCENT_BPS = 290;
export const STRIPE_CARD_FIXED_CENTS = 30;

export function customerFeeShareForPayer(feePayer: EventFeePayer) {
  return feePayer === "customer" ? 1 : feePayer === "split" ? 0.5 : 0;
}

export function calculateEventFees(
  ticketSubtotalCents: number,
  feePayer: EventFeePayer,
  platformFeeBps = THEOUTHAVEN_PLATFORM_FEE_BPS,
) {
  const subtotal = Math.max(0, Math.round(ticketSubtotalCents));
  const safePlatformFeeBps = Math.max(0, Math.min(2500, Math.round(platformFeeBps)));
  const platformFee = Math.round((subtotal * safePlatformFeeBps) / 10000);
  const buyerShare = customerFeeShareForPayer(feePayer);
  const stripeRate = STRIPE_CARD_PERCENT_BPS / 10000;

  // Buyer service fee is grossed up so the selected buyer share covers the same
  // share of both the TheOutHaven platform fee and Stripe's processing cost on
  // the final card total. The actual Stripe fee can vary by payment method.
  const buyerFee = buyerShare === 0
    ? 0
    : Math.round(
        (buyerShare * (platformFee + subtotal * stripeRate + STRIPE_CARD_FIXED_CENTS)) /
          (1 - buyerShare * stripeRate),
      );

  const customerTotal = subtotal + buyerFee;
  const stripeProcessingEstimate = Math.round(customerTotal * stripeRate) + STRIPE_CARD_FIXED_CENTS;
  const totalFeeBurden = platformFee + stripeProcessingEstimate;
  const organizerFee = Math.max(0, totalFeeBurden - buyerFee);
  const organizerNetEstimate = Math.max(0, subtotal - organizerFee);

  return {
    ticketSubtotalCents: subtotal,
    platformFeeBps: safePlatformFeeBps,
    platformFeeCents: platformFee,
    stripeProcessingEstimateCents: stripeProcessingEstimate,
    customerServiceFeeCents: buyerFee,
    organizerFeeCents: organizerFee,
    customerTotalCents: customerTotal,
    organizerNetEstimateCents: organizerNetEstimate,
  };
}
