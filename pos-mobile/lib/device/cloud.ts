import type { PosClaimTransport } from "@/lib/device/identity";

const API_BASE=String(process.env.EXPO_PUBLIC_THEPOSHAVEN_API_URL||"https://theouthaven.com").replace(/\/$/,"");

async function jsonRequest(path: string, init: RequestInit={}) {
  const response=await fetch(`${API_BASE}${path}`,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(String(data?.error||`pos_api_http_${response.status}`));
  return data;
}

export const posClaimTransport: PosClaimTransport={
  async claim(input) {
    const data=await jsonRequest("/api/pos/device/claim",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(input),
    });
    return {
      deviceId:String(data.deviceId||""),
      locationId:String(data.locationId||""),
      locationName:typeof data.locationName==="string"?data.locationName:null,
      credential:String(data.credential||""),
    };
  },
};

export type PosCloudCommand={
  id:string;
  command_type:string;
  source_type?:string|null;
  source_id?:string|null;
  attempts:number;
  payload:Record<string,any>;
  created_at:string;
};

export async function fetchPosDeviceCommands(input:{
  deviceId:string;
  credential:string;
  limit?:number;
  waitSeconds?:number;
}) {
  const waitSeconds=Math.min(Math.max(input.waitSeconds||0,0),25);
  const data=await jsonRequest(`/api/pos/device/commands?limit=${Math.min(Math.max(input.limit||10,1),25)}&waitSeconds=${waitSeconds}`,{
    method:"GET",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
    },
  });
  return (Array.isArray(data.commands)?data.commands:[]) as PosCloudCommand[];
}

export async function acknowledgePosDeviceCommand(input:{
  deviceId:string;
  credential:string;
  commandId:string;
  ok:boolean;
  error?:string|null;
}) {
  await jsonRequest("/api/pos/device/commands",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({
      commandId:input.commandId,
      ok:input.ok,
      error:input.error||null,
    }),
  });
}

export async function updatePosOnlineOrderStatus(input:{
  deviceId:string;
  credential:string;
  onlineOrderId:string;
  status:"accepted"|"preparing"|"ready"|"completed"|"canceled";
}) {
  const data=await jsonRequest("/api/pos/device/orders/status",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({
      onlineOrderId:input.onlineOrderId,
      status:input.status,
    }),
  });
  return data.order as Record<string,unknown>;
}

export type PosActiveOnlineOrder = {
  id:string;
  status:"received"|"accepted"|"preparing"|"ready";
  customerName:string;
  customerEmail?:string|null;
  customerPhone?:string|null;
  promisedPickupAt?:string|null;
  createdAt:string;
  amounts:{
    subtotalCents:number;
    taxCents:number;
    serviceChargeCents:number;
    tipCents:number;
    totalCents:number;
  };
  lines:{name:string;quantity:number;modifiers:any[];notes?:string|null}[];
};

export async function fetchPosActiveOnlineOrders(input:{
  deviceId:string;
  credential:string;
  limit?:number;
}) {
  const data=await jsonRequest(`/api/pos/device/orders?limit=${Math.min(Math.max(input.limit||50,1),100)}`,{
    method:"GET",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
    },
  });
  return (Array.isArray(data.orders)?data.orders:[]) as PosActiveOnlineOrder[];
}

export type PosOutputConfigRoute={
  role:string;
  deviceId:string;
  stationKey:string;
  priority:number;
  serialNumber?:string|null;
  provider?:string|null;
  providerDeviceId?:string|null;
};

export async function fetchPosOutputConfig(input:{
  deviceId:string;
  credential:string;
}) {
  const data=await jsonRequest("/api/pos/device/config",{
    method:"GET",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
    },
  });
  return {
    revision:String(data.config?.revision||""),
    routes:(Array.isArray(data.config?.routes)?data.config.routes:[]) as PosOutputConfigRoute[],
  };
}


export type PosTableReservation={
  id:string;
  customerName:string;
  customerPhone?:string|null;
  date:string;
  time:string;
  partySize:number;
  status:string;
};

export type PosTableSummary={
  id:string;
  label:string;
  number?:string|null;
  capacity:number;
  status:string;
  reservation?:PosTableReservation|null;
  openCheck?:{id:string;guestCount:number;totalCents:number;openedAt:string}|null;
};

export type PosTableCatalogItem={
  id:string;
  sectionId?:string|null;
  name:string;
  fullName:string;
  description?:string|null;
  imageUrl?:string|null;
  priceCents:number;
  isAvailable:boolean;
  lowStock:boolean;
  course:"drinks"|"appetizers"|"entrees"|"desserts"|"other";
  modifiers:{
    id:string;name:string;minSelect:number;maxSelect:number|null;required:boolean;
    modifiers:{id:string;name:string;priceDeltaCents:number}[];
  }[];
};

export type PosTableWorkspace={
  id:string;
  status:string;
  guestCount:number;
  reservation?:PosTableReservation|null;
  resources:any[];
  staff:{id:string;name:string;role:string}[];
  amounts:{
    subtotalCents:number;discountCents:number;taxCents:number;serviceChargeCents:number;
    totalCents:number;amountPaidCents:number;amountRefundedCents:number;remainingCents:number;tipCents:number;
  };
  tenders:{
    id:string;number:number;type:string;status:string;amountCents:number;tipCents:number;
    amountRefundedCents:number;refundableCents:number;cashReceivedCents?:number|null;cashChangeCents?:number|null;
  }[];
  items:{
    id:string;orderId:string;catalogItemId?:string|null;name:string;seatNumber?:number|null;shared:boolean;
    course:"drinks"|"appetizers"|"entrees"|"desserts"|"other";quantity:number;
    unitPriceCents:number;modifierTotalCents:number;lineTotalCents:number;modifiers:any[];notes?:string|null;status:string;
  }[];
};

export async function fetchPosTableService(input:{deviceId:string;credential:string}){
  const data=await jsonRequest("/api/pos/device/table-service",{
    method:"GET",
    headers:{Authorization:`Bearer ${input.credential}`,"X-Pos-Device-Id":input.deviceId},
  });
  return {
    tables:(Array.isArray(data.tables)?data.tables:[]) as PosTableSummary[],
    catalog:data.catalog as {page:any;sections:{id:string;name:string;sortOrder:number}[];items:PosTableCatalogItem[]},
  };
}

export async function fetchPosTableWorkspace(input:{deviceId:string;credential:string;checkId:string}){
  const data=await jsonRequest("/api/pos/device/table-service?checkId="+encodeURIComponent(input.checkId),{
    method:"GET",
    headers:{Authorization:`Bearer ${input.credential}`,"X-Pos-Device-Id":input.deviceId},
  });
  return data.workspace as PosTableWorkspace;
}

async function mutatePosTable(input:{deviceId:string;credential:string;body:Record<string,unknown>}){
  const data=await jsonRequest("/api/pos/device/table-service",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify(input.body),
  });
  return data.workspace as PosTableWorkspace;
}

export function openPosTableCheck(input:{deviceId:string;credential:string;layoutItemId:string;guestCount?:number|null}){
  return mutatePosTable({...input,body:{action:"open_check",layoutItemId:input.layoutItemId,guestCount:input.guestCount??null}});
}
export function updatePosTableGuestCount(input:{deviceId:string;credential:string;checkId:string;guestCount:number}){
  return mutatePosTable({...input,body:{action:"update_guest_count",checkId:input.checkId,guestCount:input.guestCount}});
}
export function addPosTableItem(input:{
  deviceId:string;credential:string;checkId:string;catalogItemId:string;seatNumbers?:number[]|null;
  course?:string|null;quantity?:number;modifierIds?:string[];notes?:string|null;
}){
  return mutatePosTable({...input,body:{
    action:"add_item",checkId:input.checkId,catalogItemId:input.catalogItemId,
    seatNumbers:input.seatNumbers??null,course:input.course??null,quantity:input.quantity??1,
    modifierIds:input.modifierIds??[],notes:input.notes??null,
  }});
}
export function sendPosTableCourses(input:{deviceId:string;credential:string;checkId:string;courses?:string[]|null}){
  return mutatePosTable({...input,body:{action:"send_courses",checkId:input.checkId,courses:input.courses??null}});
}


export type SignaturePlusKdsTicket={
  id:string;checkId:string;tableLabels:string[];course:string;status:string;held:boolean;
  sentAt:string;firedAt?:string|null;elapsedSeconds:number;stations:string[];
  lines:{id:string;name:string;seatNumber?:number|null;quantity:number;modifiers:any[];notes?:string|null;status:string;station:string}[];
};

export type SignaturePlusReport={
  from:string;to:string;
  metrics:{
    grossSalesCents:number;netSalesCents:number;refundsCents:number;tipsCents:number;
    discountsCents:number;taxCents:number;checks:number;averageCheckCents:number;
  };
  paymentMethods:{type:string;amountCents:number}[];
  topItems:{name:string;quantity:number;salesCents:number}[];
};

export async function fetchSignaturePlus(input:{deviceId:string;credential:string;view?:"bootstrap"|"kds"|"inventory"|"report";station?:string|null;from?:string|null;to?:string|null}){
  const params=new URLSearchParams();
  if(input.view&&input.view!=="bootstrap") params.set("view",input.view);
  if(input.station) params.set("station",input.station);
  if(input.from) params.set("from",input.from);
  if(input.to) params.set("to",input.to);
  const suffix=params.toString()?("?"+params.toString()):"";
  return jsonRequest("/api/pos/device/signature-plus"+suffix,{
    method:"GET",
    headers:{Authorization:`Bearer ${input.credential}`,"X-Pos-Device-Id":input.deviceId},
  });
}

async function mutateSignaturePlus(input:{deviceId:string;credential:string;body:Record<string,unknown>}){
  const data=await jsonRequest("/api/pos/device/signature-plus",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify(input.body),
  });
  return data.result;
}

export function updateSignaturePlusCourse(input:{deviceId:string;credential:string;orderId:string;courseAction:"hold"|"release_hold"|"fire"|"ready"}){
  return mutateSignaturePlus({...input,body:{action:"course_state",orderId:input.orderId,courseAction:input.courseAction}});
}
export function moveSignaturePlusTable(input:{deviceId:string;credential:string;checkId:string;targetLayoutItemId:string;merge?:boolean}){
  return mutateSignaturePlus({...input,body:{action:input.merge?"table_merge":"table_move",checkId:input.checkId,targetLayoutItemId:input.targetLayoutItemId}});
}
export function transferSignaturePlusServer(input:{deviceId:string;credential:string;checkId:string;staffProfileId:string}){
  return mutateSignaturePlus({...input,body:{action:"transfer_server",checkId:input.checkId,staffProfileId:input.staffProfileId}});
}
export function createSignaturePlusSplit(input:{deviceId:string;credential:string;checkId:string;mode:"by_guest"|"even"|"custom";parts?:number;custom?:Record<string,number>}){
  return mutateSignaturePlus({...input,body:{action:"split",checkId:input.checkId,mode:input.mode,parts:input.parts,custom:input.custom}});
}

export function createSignaturePlusSplitTender(input:{deviceId:string;credential:string;checkId:string;allocationKey:string;tipCents?:number}){
  return mutateSignaturePlus({...input,body:{action:"split_tender",checkId:input.checkId,allocationKey:input.allocationKey,tipCents:input.tipCents||0}});
}


async function mutatePosManager(input:{deviceId:string;credential:string;body:Record<string,unknown>}){
  const data=await jsonRequest("/api/pos/device/manager",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify(input.body),
  });
  return data.result;
}

export function recordPosCashTender(input:{
  deviceId:string;credential:string;checkId:string;cashReceivedCents:number;
  amountCents?:number|null;tipCents?:number;actorStaffProfileId?:string|null;
}){
  return mutatePosManager({...input,body:{
    action:"cash_tender",checkId:input.checkId,cashReceivedCents:input.cashReceivedCents,
    amountCents:input.amountCents??null,tipCents:input.tipCents||0,
    actorStaffProfileId:input.actorStaffProfileId||null,
  }});
}

export function applyPosManagerDiscount(input:{
  deviceId:string;credential:string;checkId:string;discountCents:number;
  actorStaffProfileId?:string|null;managerStaffProfileId:string;managerPin:string;reason:string;
}){
  return mutatePosManager({...input,body:{action:"discount_check",checkId:input.checkId,
    discountCents:input.discountCents,actorStaffProfileId:input.actorStaffProfileId||null,
    managerStaffProfileId:input.managerStaffProfileId,managerPin:input.managerPin,reason:input.reason}});
}

export function voidPosManagerItem(input:{
  deviceId:string;credential:string;orderItemId:string;
  actorStaffProfileId?:string|null;managerStaffProfileId:string;managerPin:string;reason:string;
}){
  return mutatePosManager({...input,body:{action:"void_item",orderItemId:input.orderItemId,
    actorStaffProfileId:input.actorStaffProfileId||null,
    managerStaffProfileId:input.managerStaffProfileId,managerPin:input.managerPin,reason:input.reason}});
}

export function refundPosManagerTender(input:{
  deviceId:string;credential:string;tenderId:string;amountCents:number;
  actorStaffProfileId?:string|null;managerStaffProfileId:string;managerPin:string;
  reason:string;idempotencyKey:string;
}){
  return mutatePosManager({...input,body:{action:"refund_tender",tenderId:input.tenderId,
    amountCents:input.amountCents,actorStaffProfileId:input.actorStaffProfileId||null,
    managerStaffProfileId:input.managerStaffProfileId,managerPin:input.managerPin,
    reason:input.reason,idempotencyKey:input.idempotencyKey}});
}

export function openPosDrawerSession(input:{
  deviceId:string;credential:string;openingCashCents:number;actorStaffProfileId?:string|null;
}){
  return mutatePosManager({...input,body:{action:"open_drawer",openingCashCents:input.openingCashCents,
    actorStaffProfileId:input.actorStaffProfileId||null}});
}

export function closePosDrawerSession(input:{
  deviceId:string;credential:string;sessionId:string;countedCashCents:number;
  managerStaffProfileId:string;managerPin:string;
}){
  return mutatePosManager({...input,body:{action:"close_drawer",sessionId:input.sessionId,
    countedCashCents:input.countedCashCents,
    managerStaffProfileId:input.managerStaffProfileId,managerPin:input.managerPin}});
}


export async function fetchPosManagerOperations(input:{deviceId:string;credential:string}){
  const data=await jsonRequest("/api/pos/device/manager",{
    method:"GET",
    headers:{Authorization:`Bearer ${input.credential}`,"X-Pos-Device-Id":input.deviceId},
  });
  return data.operations as {drawers:any[];events:any[]};
}


export function reprintPosReceipt(input:{
  deviceId:string;credential:string;checkId:string;
}){
  return mutatePosManager({...input,body:{action:"receipt_reprint",checkId:input.checkId}});
}


export type PosManagerControlData={
  drawers:any[];
  events:any[];
  checks:any[];
  tenders:any[];
  items:any[];
  staff:any[];
  managers:any[];
};

export async function fetchPosManagerControls(input:{deviceId:string;credential:string}){
  const data=await jsonRequest("/api/pos/device/manager-controls",{
    method:"GET",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
    },
  });
  return data.operations as PosManagerControlData;
}

async function mutatePosManagerControls(input:{deviceId:string;credential:string;body:Record<string,unknown>}){
  const data=await jsonRequest("/api/pos/device/manager-controls",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.credential}`,
      "X-Pos-Device-Id":input.deviceId,
      "Content-Type":"application/json",
    },
    body:JSON.stringify(input.body),
  });
  return data.result;
}

export function recordPosCashTenderCloud(input:{
  deviceId:string;credential:string;checkId:string;cashReceivedCents:number;amountCents?:number|null;
  tipCents?:number;actorStaffProfileId?:string|null;
}){
  return mutatePosManagerControls({...input,body:{
    action:"cash_tender",checkId:input.checkId,cashReceivedCents:input.cashReceivedCents,
    amountCents:input.amountCents??null,tipCents:input.tipCents||0,
    actorStaffProfileId:input.actorStaffProfileId||null,
  }});
}

export function applyPosDiscountCloud(input:{
  deviceId:string;credential:string;checkId:string;discountCents:number;actorStaffProfileId:string;
  approverStaffProfileId:string;managerPin:string;reason:string;
}){
  return mutatePosManagerControls({...input,body:{action:"discount",checkId:input.checkId,discountCents:input.discountCents,
    actorStaffProfileId:input.actorStaffProfileId,approverStaffProfileId:input.approverStaffProfileId,
    managerPin:input.managerPin,reason:input.reason}});
}

export function voidPosItemCloud(input:{
  deviceId:string;credential:string;orderItemId:string;actorStaffProfileId:string;
  approverStaffProfileId:string;managerPin:string;reason:string;
}){
  return mutatePosManagerControls({...input,body:{action:"void_item",orderItemId:input.orderItemId,
    actorStaffProfileId:input.actorStaffProfileId,approverStaffProfileId:input.approverStaffProfileId,
    managerPin:input.managerPin,reason:input.reason}});
}

export function refundPosTenderCloud(input:{
  deviceId:string;credential:string;tenderId:string;amountCents:number;actorStaffProfileId:string;
  approverStaffProfileId:string;managerPin:string;reason:string;idempotencyKey:string;
}){
  return mutatePosManagerControls({...input,body:{action:"refund",tenderId:input.tenderId,amountCents:input.amountCents,
    actorStaffProfileId:input.actorStaffProfileId,approverStaffProfileId:input.approverStaffProfileId,
    managerPin:input.managerPin,reason:input.reason,idempotencyKey:input.idempotencyKey}});
}

export function openPosDrawerSessionCloud(input:{
  deviceId:string;credential:string;openingCashCents:number;actorStaffProfileId?:string|null;
}){
  return mutatePosManagerControls({...input,body:{action:"drawer_open",openingCashCents:input.openingCashCents,
    actorStaffProfileId:input.actorStaffProfileId||null}});
}

export function closePosDrawerSessionCloud(input:{
  deviceId:string;credential:string;sessionId:string;countedCashCents:number;
  approverStaffProfileId:string;managerPin:string;
}){
  return mutatePosManagerControls({...input,body:{action:"drawer_close",sessionId:input.sessionId,
    countedCashCents:input.countedCashCents,approverStaffProfileId:input.approverStaffProfileId,
    managerPin:input.managerPin}});
}
