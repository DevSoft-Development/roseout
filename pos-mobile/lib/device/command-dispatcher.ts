import * as Notifications from "expo-notifications";
import { Vibration } from "react-native";
import type { RoleBasedPosOutputRouter, PosOutputRole } from "@/lib/output/routing";
import { acknowledgePosDeviceCommand, fetchPosDeviceCommands, type PosCloudCommand } from "@/lib/device/cloud";
import type { PosClaimSession } from "@/lib/device/identity";

const encoder=new TextEncoder();

function dollars(cents: unknown) {
  return `$${(Number(cents||0)/100).toFixed(2)}`;
}
function line(value: unknown,width=42) {
  const text=String(value??"").replace(/\s+/g," ").trim();
  return text.length<=width?text:text.slice(0,width);
}
function ticketText(command: PosCloudCommand) {
  const p=command.payload||{};
  const lines=Array.isArray(p.lines)?p.lines:[];
  const out=[
    "THEPOSHAVEN ONLINE ORDER",
    "==========================================",
    `Order: ${String(p.online_order_id||command.source_id||"").slice(0,8).toUpperCase()}`,
    `Status: ${String(p.order_status||"received").toUpperCase()}`,
    `Customer: ${line(p.customer?.name||"Guest")}`,
    p.promised_pickup_at?`Pickup: ${new Date(p.promised_pickup_at).toLocaleString()}`:"",
    "------------------------------------------",
  ].filter(Boolean);
  for(const item of lines){
    out.push(`${Number(item.quantity||1)} x ${line(item.item_name||"Item",34)}`);
    const mods=Array.isArray(item.modifiers)?item.modifiers:[];
    for(const mod of mods) out.push(`   + ${line(mod?.name||mod,34)}`);
    if(item.notes) out.push(`   Note: ${line(item.notes,32)}`);
  }
  out.push(
    "------------------------------------------",
    `Subtotal: ${dollars(p.amounts?.subtotal_cents)}`,
    Number(p.amounts?.tax_cents||0)?`Tax: ${dollars(p.amounts.tax_cents)}`:"",
    Number(p.amounts?.service_charge_cents||0)?`Service: ${dollars(p.amounts.service_charge_cents)}`:"",
    Number(p.amounts?.tip_cents||0)?`Tip: ${dollars(p.amounts.tip_cents)}`:"",
    `TOTAL: ${dollars(p.amounts?.total_cents)}`,
    "",
  );
  return out.filter(Boolean).join("\n");
}
function escPos(text:string) {
  const body=encoder.encode(text+"\n\n\n");
  const bytes=new Uint8Array(3+body.length+4);
  bytes.set([0x1b,0x40,0x1b],0);
  bytes.set(body,3);
  bytes.set([0x1d,0x56,0x00,0x00],3+body.length);
  return bytes;
}

async function alertOnlineOrder(command: PosCloudCommand) {
  Vibration.vibrate([0,220,120,220]);
  try {
    await Notifications.scheduleNotificationAsync({
      content:{
        title:"New online order",
        body:`${command.payload?.customer?.name||"Customer"} · ${dollars(command.payload?.amounts?.total_cents)}`,
        sound:"default",
        data:{onlineOrderId:command.payload?.online_order_id||command.source_id||null},
      },
      trigger:null,
    });
  } catch {
    // Local vibration remains available even when notification permission is off.
  }
}

async function tryOutput(router:RoleBasedPosOutputRouter,role:PosOutputRole,payload:Uint8Array){
  try {
    const deviceId=await router.send(role,payload);
    return {role,ok:true,deviceId};
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(message.startsWith("pos_output_route_missing:")) return {role,ok:true,skipped:true};
    return {role,ok:false,error:message};
  }
}

export async function dispatchPosCloudCommand(input:{
  command:PosCloudCommand;
  router:RoleBasedPosOutputRouter;
}) {
  const command=input.command;
  if(command.command_type!=="online_order_received"&&command.command_type!=="online_order_status_changed"){
    return {ok:true,outputs:[]};
  }
  if(command.command_type==="online_order_received") await alertOnlineOrder(command);
  const autoPrint=command.payload?.auto_print!==false;
  if(!autoPrint) return {ok:true,outputs:[]};

  const payload=escPos(ticketText(command));
  const roles:PosOutputRole[]=["receipt","kitchen_hot_line","expo"];
  const outputs=[];
  for(const role of roles) outputs.push(await tryOutput(input.router,role,payload));
  const hardFailures=outputs.filter((result:any)=>result.ok===false);
  return {
    ok:hardFailures.length===0,
    outputs,
    error:hardFailures.map((result:any)=>`${result.role}:${result.error}`).join("|")||null,
  };
}

export async function pollAndDispatchPosCommands(input:{
  session:PosClaimSession;
  router:RoleBasedPosOutputRouter;
  maxCommands?:number;
}) {
  const commands=await fetchPosDeviceCommands({
    deviceId:input.session.deviceId,
    credential:input.session.credential,
    limit:input.maxCommands||10,
  });
  const results=[];
  for(const command of commands){
    let result:{ok:boolean;error?:string|null;outputs?:unknown[]};
    try{
      result=await dispatchPosCloudCommand({command,router:input.router});
    }catch(error){
      result={ok:false,error:error instanceof Error?error.message:String(error)};
    }
    await acknowledgePosDeviceCommand({
      deviceId:input.session.deviceId,
      credential:input.session.credential,
      commandId:command.id,
      ok:result.ok,
      error:result.error||null,
    });
    results.push({commandId:command.id,...result});
  }
  return results;
}
