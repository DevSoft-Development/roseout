import { readFileSync } from "node:fs";

const service=readFileSync("lib/pos/signature-plus/service.ts","utf8");
const ui=readFileSync("pos-mobile/components/SignaturePlusWorkspace.tsx","utf8");
const cloud=readFileSync("pos-mobile/lib/device/cloud.ts","utf8");
const home=readFileSync("pos-mobile/app/index.tsx","utf8");
const command=readFileSync("lib/pos/device-command-service.ts","utf8");
const root=readFileSync("app/api/pos/device/signature-plus/route.ts","utf8");
const consumer=readFileSync("apps/consumer/app/api/pos/device/signature-plus/route.ts","utf8");
const access=readFileSync("lib/pos/access.ts","utf8");
const inventoryService=readFileSync("lib/pos/inventory/service.ts","utf8");
const businessOps=readFileSync("apps/business/app/locations/dashboard/pos/operations/page.tsx","utf8");
const businessHub=readFileSync("apps/business/app/locations/dashboard/pos/page.tsx","utf8");
const businessActions=readFileSync("apps/business/app/locations/dashboard/pos/operations/actions.ts","utf8");

const features=[
  ["1 hold / fire",service.includes('"hold"|"release_hold"|"fire"|"ready"')&&ui.includes("Mark Ready")&&ui.includes(">Hold<")],
  ["2 seat based kitchen tickets",service.includes("seat_number")&&ui.includes("Seat ")],
  ["3 kitchen bar expo routing",service.includes("prepStation")&&service.includes("stations")&&ui.includes("All Stations")],
  ["4 KDS",service.includes("listSignaturePlusKds")&&ui.includes("KDS")],
  ["5 move / merge tables",service.includes("moveOrMergeSignaturePlusTable")&&ui.includes("Move / Merge Table")],
  ["6 transfer server",service.includes("transferSignaturePlusServer")&&ui.includes("Transfer Server")],
  ["7 advanced split check",service.includes("buildSignaturePlusSplit")&&service.includes("createSignaturePlusSplitTender")&&service.includes('"by_guest"|"even"|"custom"')&&ui.includes("Charge card")],
  ["8 multi device synchronization",command.includes('"pos_state_changed"')&&service.includes("enqueuePosLocationCommand")&&cloud.includes("waitSeconds")&&!ui.includes("setInterval")],
  ["9 ingredient inventory",service.includes("inventory_role")&&service.includes("recipe_usage")&&service.includes("convertIngredientQuantity")&&ui.includes("Ingredient Inventory")],
  ["10 advanced reporting",service.includes("getSignaturePlusReport")&&ui.includes("Net Sales")&&ui.includes("Payment Methods")],
  ["11 stock area operations",service.includes("pos_inventory_stock_areas")&&service.includes("recentTransfers")&&businessOps.includes("Stock areas")&&businessActions.includes("transferPosInventory")],
  ["12 waste operations",service.includes("recentWaste")&&businessOps.includes("Log waste")&&businessActions.includes("wastePosInventory")],
  ["13 reorder visibility",service.includes("reorderNeeded")&&businessOps.includes("Reorder queue")],
  ["14 end of shift reporting",service.includes("serverPerformance")&&service.includes("courseMix")&&service.includes("inventoryMetrics")&&businessOps.includes("End-of-shift report")],
];

const failed=features.filter(([,ok])=>!ok).map(([name])=>name);
if(failed.length) throw new Error("Signature+ feature contract missing: "+failed.join(", "));

if(!access.includes("requireSignaturePlusAccess")||!access.includes("business_subscriptions")) throw new Error("Signature+ entitlement resolver missing.");
for(const route of [root,consumer]){
  for(const token of ["authenticatePosDeviceCredential","getSignaturePlusBootstrap","setSignaturePlusCourseState","moveOrMergeSignaturePlusTable","transferSignaturePlusServer","buildSignaturePlusSplit","createSignaturePlusSplitTender"]){
    if(!route.includes(token)) throw new Error("Signature+ route missing: "+token);
  }
  if(!route.includes("requireSignaturePlusAccess")) throw new Error("Signature+ route must enforce plan access.");
  for(const token of [] ){
  }
}
for(const token of ["fetchSignaturePlus","updateSignaturePlusCourse","moveSignaturePlusTable","transferSignaturePlusServer","createSignaturePlusSplit","createSignaturePlusSplitTender"]){
  if(!cloud.includes(token)) throw new Error("Signature+ device client missing: "+token);
}
if(!home.includes('workspaceMode==="signature"')||!home.includes("SignaturePlusWorkspace")){
  throw new Error("Signature+ must be reachable from the POS shell.");
}
if(inventoryService.includes("Number.isInteger(row.quantity_on_hand)")||inventoryService.includes("Number.isInteger(row.low_stock_threshold)")){
  throw new Error("Fractional ingredient inventory must not be normalized as integer-only.");
}
for(const token of ["createPosInventoryStockArea","transferPosInventory","wastePosInventory"]){
  if(!inventoryService.includes(token)) throw new Error("Stack 6 inventory service missing: "+token);
}
for(const token of ["requireSignaturePlusAccess","hasLocationPermission","recordPosInventoryWaste","transferPosInventoryStock","createPosInventoryArea"]){
  if(!businessActions.includes(token)) throw new Error("Stack 6 Business action missing: "+token);
}
if(!businessHub.includes("Inventory + Shift")||!businessHub.includes("/locations/dashboard/pos/operations")){
  throw new Error("Stack 6 operations entry point is missing from the POS control center.");
}
for(const token of ["Ingredient inventory","Area balances","Reorder queue","End-of-shift report","Server performance","Inventory movement"]){
  if(!businessOps.includes(token)) throw new Error("Stack 6 Business operations UI missing: "+token);
}

console.log("ThePOSHaven Signature+ features 1-14 verified.");
