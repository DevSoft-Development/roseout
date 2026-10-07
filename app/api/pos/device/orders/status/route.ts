import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential } from "@/lib/pos/device-command-service";
import { updateWebsitePickupOrderStatus } from "@/lib/pos/online-ordering/service";

export const dynamic="force-dynamic";

function bearer(request: Request) {
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}

export async function POST(request: Request) {
  try {
    const device=await authenticatePosDeviceCredential({
      deviceId:String(request.headers.get("x-pos-device-id")||""),
      credential:bearer(request),
    });
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object") return NextResponse.json({ok:false,error:"invalid_order_status_payload"},{status:400});
    const status=String((body as any).status||"");
    if(!["accepted","preparing","ready","completed","canceled"].includes(status)){
      return NextResponse.json({ok:false,error:"invalid_order_status"},{status:400});
    }
    const result=await updateWebsitePickupOrderStatus({
      locationId:device.locationId,
      onlineOrderId:String((body as any).onlineOrderId||""),
      status:status as "accepted"|"preparing"|"ready"|"completed"|"canceled",
      actorType:"device",
      actorId:device.deviceId,
    });
    return NextResponse.json({ok:true,order:result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"online_order_status_update_failed";
    const status=/unauthorized|missing/.test(message)?401:/invalid_transition/.test(message)?409:/not_found/.test(message)?404:500;
    return NextResponse.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
  }
}
