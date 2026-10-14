import assert from "node:assert/strict";
import { quotePosGratuity } from "../lib/pos/payments/gratuity-calculator.mjs";
const policy={auto_service_charge_enabled:true,party_size_threshold:6,service_charge_percent_bps:1800,
  applies_to_food:true,applies_to_activities:false,extra_tip_prompt_with_service_charge:false,
  customer_disclosure:"18% service charge is added for groups of six or more."};
const mixed=[{type:"food",amountCents:6500},{type:"activity",amountCents:9000},{type:"rental",amountCents:1500}];
const group=quotePosGratuity({lines:mixed,guestCount:6,policy});
assert.deepEqual(group,{subtotalCents:17000,serviceChargeCents:1170,tipCents:0,beforeTaxCents:18170,
  serviceChargeApplied:true,tipPromptAllowed:false,eligibleServiceChargeCents:6500});
const small=quotePosGratuity({lines:mixed,guestCount:4,policy,selectedTipBasisPoints:2000});
assert.equal(small.serviceChargeCents,0);
assert.equal(small.tipCents,3400);
assert.equal(small.beforeTaxCents,20400);
assert.throws(()=>quotePosGratuity({lines:mixed,guestCount:6,policy,selectedTipBasisPoints:2000}),/extra_tip_disabled/);
assert.throws(()=>quotePosGratuity({lines:mixed,guestCount:6,policy:{...policy,customer_disclosure:""} }),/service_charge_disclosure_required/);
const activity=quotePosGratuity({lines:mixed,guestCount:6,policy:{...policy,applies_to_food:false,applies_to_activities:true}});
assert.equal(activity.serviceChargeCents,1890);
assert.throws(()=>quotePosGratuity({lines:[{type:"food",amountCents:-1}],guestCount:1,policy}),/invalid_line_amount/);
assert.throws(()=>quotePosGratuity({lines:[{type:"food",amountCents:NaN}],guestCount:1,policy}),/invalid_line_amount/);
console.log("POS gratuity quote regression passed: restaurant, activity, hybrid, threshold, anti-double-tip, invalid inputs");
