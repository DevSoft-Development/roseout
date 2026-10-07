import { NextResponse } from "next/server";
import { authenticatePosDeviceCredential, getPosDeviceOutputConfig } from "@/lib/pos/device-command-service";

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
    const config=await getPosDeviceOutputConfig(device);
    return NextResponse.json({ok:true,config},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"pos_output_config_failed";
    return NextResponse.json({ok:false,error:message},{status:/unauthorized|missing/.test(message)?401:500,headers:{"Cache-Control":"no-store"}});
  }
}
