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
}) {
  const data=await jsonRequest(`/api/pos/device/commands?limit=${Math.min(Math.max(input.limit||10,1),25)}`,{
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
