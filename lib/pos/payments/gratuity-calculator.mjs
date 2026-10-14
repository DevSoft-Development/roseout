/**
 * Pure quote calculation for restaurant, activity and mixed checks.
 * Does not capture, adjust or authorize any payments.
 * All monetary inputs and outputs are integer minor currency units.
 */
const positiveInt = (n, field) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid_" + field);
  return n;
};
const roundHalfUp = (cents, basisPoints) =>
  Math.floor((cents * basisPoints + 5000) / 10000);

export function quotePosGratuity({ lines, guestCount, policy, selectedTipBasisPoints = 0 }) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("invalid_lines");
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100) throw new Error("invalid_guest_count");
  const tipRate = positiveInt(selectedTipBasisPoints, "tip_rate");
  if (tipRate > 10000) throw new Error("invalid_tip_rate");
  const serviceRate = positiveInt(policy?.service_charge_percent_bps ?? 0, "service_rate");
  if (serviceRate > 3000) throw new Error("invalid_service_rate");
  const threshold = policy?.party_size_threshold ?? 1;
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 100) throw new Error("invalid_threshold");
  const subtotal = lines.reduce((sum, line) => {
    if (!["food", "beverage", "activity", "rental", "merchandise"].includes(line.type)) throw new Error("invalid_item_type");
    return sum + positiveInt(line.amountCents, "line_amount");
  }, 0);
  const eligible = lines.reduce((sum, line) =>
    sum + ((["food","beverage"].includes(line.type) && policy?.applies_to_food) ||
      (["activity","rental"].includes(line.type) && policy?.applies_to_activities)
      ? line.amountCents : 0), 0);
  const active = policy?.auto_service_charge_enabled === true && guestCount >= threshold;
  if (active && (!policy?.customer_disclosure || policy.customer_disclosure.trim().length < 16))
    throw new Error("service_charge_disclosure_required");
  const serviceChargeCents = active ? roundHalfUp(eligible, serviceRate) : 0;
  // Mandatory service charge is not itself a tip; hide tips unless location explicitly opts in.
  const tipAllowed = !active || policy?.extra_tip_prompt_with_service_charge === true;
  if (!tipAllowed && tipRate !== 0) throw new Error("extra_tip_disabled");
  const tipCents = tipAllowed ? roundHalfUp(subtotal,tipRate) : 0;
  const beforeTaxCents = subtotal + serviceChargeCents + tipCents;
  if (!Number.isSafeInteger(beforeTaxCents)) throw new Error("invalid_total");
  return {subtotalCents:subtotal,serviceChargeCents,tipCents,beforeTaxCents,
    serviceChargeApplied:active,tipPromptAllowed:tipAllowed,eligibleServiceChargeCents:eligible};
}
