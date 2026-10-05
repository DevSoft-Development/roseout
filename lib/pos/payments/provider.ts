import "server-only";

import type { PosPaymentProvider, PosPaymentProviderId } from "@/lib/pos/payments/contracts";
import { StripePosPaymentProvider } from "@/lib/pos/payments/stripe";
import type { StripeMode } from "@/lib/stripe/server";

export type PosPaymentProviderContext = {
  provider?: PosPaymentProviderId;
  stripeMode: StripeMode;
};

export function getPosPaymentProvider(context: PosPaymentProviderContext): PosPaymentProvider {
  const provider = context.provider || "stripe";
  switch (provider) {
    case "stripe":
      return new StripePosPaymentProvider(context.stripeMode);
    default: {
      const exhaustive: never = provider;
      throw new Error(`unsupported_pos_payment_provider:${String(exhaustive)}`);
    }
  }
}
