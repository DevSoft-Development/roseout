import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential, listPosActiveOnlineOrders } from "@/lib/pos/device-command-service";

export const dynamic="force-dynamic";

function bearer(request: Request) {
  const value=request.headers.get("authorization")||"";
  return value.toLowerCase().startsWith("bearer ")?value.slice(7).trim():"";
}

export async function GET(request: Request) {
  try {
    const device=await authenticatePosDeviceCredential({
      deviceId:String(request.headers.get("x-pos-device-id")||""),
      credential:bearer(request),
    });
    const url=new URL(request.url);
    const orders=await listPosActiveOnlineOrders({
      locationId:device.locationId,
      limit:Number(url.searchParams.get("limit")||50),
    });
    return NextResponse.json({ok:true,orders},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"pos_online_orders_list_failed";
    return NextResponse.json({ok:false,error:message},{status:/unauthorized|missing/.test(message)?401:500,headers:{"Cache-Control":"no-store"}});
  }
}
