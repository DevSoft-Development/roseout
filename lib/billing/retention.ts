export type RetentionOffer = {
  tenureMonths: number;
  discountPercent: number;
  discountMonths: number;
  label: string;
};

export function calculateSubscriptionTenureMonths(createdAtSeconds?: number | null, now = Date.now()) {
  if (!createdAtSeconds || !Number.isFinite(createdAtSeconds)) return 0;
  const createdAt = createdAtSeconds * 1000;
  if (createdAt >= now) return 0;
  return Math.max(0, Math.floor((now - createdAt) / (30.4375 * 24 * 60 * 60 * 1000)));
}

export function getRetentionOffer(tenureMonths: number): RetentionOffer {
  const months = Math.max(0, Math.floor(tenureMonths || 0));
  if (months >= 24) return { tenureMonths: months, discountPercent: 30, discountMonths: 6, label: "30% off for 6 months" };
  if (months >= 12) return { tenureMonths: months, discountPercent: 25, discountMonths: 6, label: "25% off for 6 months" };
  if (months >= 6) return { tenureMonths: months, discountPercent: 20, discountMonths: 3, label: "20% off for 3 months" };
  if (months >= 3) return { tenureMonths: months, discountPercent: 15, discountMonths: 3, label: "15% off for 3 months" };
  return { tenureMonths: months, discountPercent: 10, discountMonths: 2, label: "10% off for 2 months" };
}
