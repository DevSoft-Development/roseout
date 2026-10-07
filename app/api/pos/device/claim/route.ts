import { NextResponse } from "next/server";
import { claimPosDeviceCredential } from "@/lib/pos/device-command-service";

export const dynamic="force-dynamic";

export async function POST(request: Request) {
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object") return NextResponse.json({error:"Invalid claim payload."},{status:400});
  try {
    const claimed=await claimPosDeviceCredential({
      pairingCode:String((body as any).pairingCode||""),
      installationId:String((body as any).installationId||""),
    });
    return NextResponse.json({ok:true,...claimed},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"pos_device_claim_failed";
    const status=/invalid|expired|missing|not_assigned/.test(message)?401:500;
    return NextResponse.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
  }
}
