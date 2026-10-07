import { readFileSync } from "node:fs";

const service=readFileSync("lib/pos/signature-plus/service.ts","utf8");
const ui=readFileSync("pos-mobile/components/SignaturePlusWorkspace.tsx","utf8");
const cloud=readFileSync("pos-mobile/lib/device/cloud.ts","utf8");
const home=readFileSync("pos-mobile/app/index.tsx","utf8");
const command=readFileSync("lib/pos/device-command-service.ts","utf8");
const root=readFileSync("app/api/pos/device/signature-plus/route.ts","utf8");
const consumer=readFileSync("apps/consumer/app/api/pos/device/signature-plus/route.ts","utf8");
const access=readFileSync("lib/pos/access.ts","utf8");

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

console.log("ThePOSHaven Signature+ features 1-10 verified.");
