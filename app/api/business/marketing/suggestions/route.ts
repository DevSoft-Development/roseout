import { NextResponse } from "next/server";
import { requireLocationPermission } from "@/lib/location-access";
export async function GET(request: Request){
  const { context: ctx, error } = await requireLocationPermission({ request, requiredPermission: "marketing.view", allowDemoPreview: true });
  if(error) return error;
  const hasMenu=false, hasQr=true;
  return NextResponse.json({locationId:ctx.locationId,suggestions:[{title:"Social post idea",channel:"Instagram or TikTok",cta:"Plan your night out"},{title:"Promo idea",channel:"Offer",cta:"Claim this week"},{title:"Event/night-out caption",channel:"Social",cta:"Bring your crew"},{title:"Business profile improvement",channel:"TheOutHaven profile",cta:"Save this spot"},...(hasMenu?[{title:"Menu promotion",channel:"Menu",cta:"View the menu"}]:[]),...(hasQr?[{title:"QR promotion",channel:"QR code",cta:"Scan for details"}]:[])]});
}
