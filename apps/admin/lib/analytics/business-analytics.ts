export function isBusinessPro(locationOrBusiness: Record<string, unknown> | null | undefined) {
  const values = [
    locationOrBusiness?.plan,
    locationOrBusiness?.business_plan,
    locationOrBusiness?.subscription_plan,
    locationOrBusiness?.pricing_plan,
    locationOrBusiness?.tier,
    locationOrBusiness?.subscription_tier,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const status = String(locationOrBusiness?.subscription_status || locationOrBusiness?.plan_status || "").toLowerCase();
  return values.some((value) => ["pro", "premium", "business_pro"].includes(value))
    || (values.some((value) => value.includes("pro")) && status !== "cancelled");
}
