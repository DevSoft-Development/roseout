import { readFileSync } from "node:fs";

const service=readFileSync("lib/pos/table-service/service.ts","utf8");
const ui=readFileSync("pos-mobile/components/TableServiceWorkspace.tsx","utf8");
const cloud=readFileSync("pos-mobile/lib/device/cloud.ts","utf8");
const home=readFileSync("pos-mobile/app/index.tsx","utf8");
const rootRoute=readFileSync("app/api/pos/device/table-service/route.ts","utf8");
const consumerRoute=readFileSync("apps/consumer/app/api/pos/device/table-service/route.ts","utf8");

const rules=[
  ["reservation-linked guest count",service.includes("reservation?.party_size")&&service.includes("guest_count")],
  ["guest based orders with Shared",service.includes("seat_number")&&ui.includes('label="Shared"')],
  ["course aware order model",service.includes("course_name")&&ui.includes("Send Entrées")],
  ["gradual order entry",service.includes('.eq("status","draft")')&&ui.includes("Not sent")],
  ["one table workspace",ui.includes("TableServiceWorkspace")&&ui.includes("Guest Overview")],
  ["send in stages",service.includes("sendPosTableCourses")&&ui.includes("Send Drinks")&&ui.includes("Send Apps")],
  ["tablet whole-table context",ui.includes("tabletLayout")&&ui.includes("tabletSummary")],
  ["handheld focused guest flow",ui.includes("guestScroll")&&ui.includes("handheldContent")],
  ["large-party scalable guest navigation",ui.includes("horizontal")&&ui.includes("workspace.guestCount")],
  ["multi-select repeated ordering",ui.includes("Multi-select Guests")&&service.includes("seatNumbers")&&service.includes("Array.from(new Set")],
];

const failed=rules.filter(([,ok])=>!ok).map(([name])=>name);
if(failed.length) throw new Error("POS table-service rules missing: "+failed.join(", "));

for(const route of [rootRoute,consumerRoute]){
  for(const token of ["authenticatePosDeviceCredential","getPosTableServiceBootstrap","openOrResumePosTableCheck","addPosTableItem","sendPosTableCourses"]){
    if(!route.includes(token)) throw new Error("Table-service route missing invariant: "+token);
  }
}
for(const token of ["fetchPosTableService","openPosTableCheck","addPosTableItem","sendPosTableCourses","updatePosTableGuestCount"]){
  if(!cloud.includes(token)) throw new Error("POS device client missing: "+token);
}
if(!home.includes('workspaceMode')||!home.includes('TableServiceWorkspace')) throw new Error("Table service must be reachable from POS home.");

console.log("ThePOSHaven table-service guest/course UX rules 1-10 verified.");
