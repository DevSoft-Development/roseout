import { NextResponse } from "next/server";
import { acknowledgePosDeviceCommand, authenticatePosDeviceCredential, leasePosDeviceCommands } from "@/lib/pos/device-command-service";

export const dynamic="force-dynamic";

function bearer(request: Request) {
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}
async function auth(request: Request) {
  return authenticatePosDeviceCredential({
    deviceId:String(request.headers.get("x-pos-device-id")||""),
    credential:bearer(request),
  });
}

export async function GET(request: Request) {
  try {
    const device=await auth(request);
    const url=new URL(request.url);
    const limit=Number(url.searchParams.get("limit")||10);
    const waitSeconds=Math.max(0,Math.min(25,Number(url.searchParams.get("waitSeconds")||0)));
    const deadline=Date.now()+waitSeconds*1000;
    let commands=await leasePosDeviceCommands({deviceId:device.deviceId,locationId:device.locationId,limit});
    while(!commands.length&&Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,500));
      commands=await leasePosDeviceCommands({deviceId:device.deviceId,locationId:device.locationId,limit});
    }
    return NextResponse.json({ok:true,commands},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"pos_command_fetch_failed";
    return NextResponse.json({ok:false,error:message},{status:/unauthorized|missing/.test(message)?401:500,headers:{"Cache-Control":"no-store"}});
  }
}

export async function POST(request: Request) {
  try {
    const device=await auth(request);
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object") return NextResponse.json({ok:false,error:"invalid_command_ack"},{status:400});
    const result=await acknowledgePosDeviceCommand({
      deviceId:device.deviceId,
      locationId:device.locationId,
      commandId:String((body as any).commandId||""),
      ok:(body as any).ok===true,
      error:typeof (body as any).error==="string"?(body as any).error:null,
    });
    return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"pos_command_ack_failed";
    return NextResponse.json({ok:false,error:message},{status:/unauthorized|missing/.test(message)?401:/conflict/.test(message)?409:500,headers:{"Cache-Control":"no-store"}});
  }
}
