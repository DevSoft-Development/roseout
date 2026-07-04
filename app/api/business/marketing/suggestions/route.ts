import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveSelectedLocationAccess } from "@/lib/auth/selectedLocationAccess";
export async function GET(request: Request){
  const url=new URL(request.url); const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({message:"Not signed in"},{status:401});
  const ctx=await resolveSelectedLocationAccess({userId:user.id, ...Object.fromEntries(url.searchParams.entries())});
  if(!ctx.ok) return NextResponse.json({message:ctx.status===404?"You do not have access to this location.":ctx.message},{status:ctx.status===404?403:ctx.status});
  const hasMenu=false, hasQr=true;
  return NextResponse.json({locationId:ctx.canonicalLocationId,suggestions:[{title:"Social post idea",channel:"Instagram or TikTok",cta:"Plan your night out"},{title:"Promo idea",channel:"Offer",cta:"Claim this week"},{title:"Event/night-out caption",channel:"Social",cta:"Bring your crew"},{title:"Business profile improvement",channel:"TheOutHaven profile",cta:"Save this spot"},...(hasMenu?[{title:"Menu promotion",channel:"Menu",cta:"View the menu"}]:[]),...(hasQr?[{title:"QR promotion",channel:"QR code",cta:"Scan for details"}]:[])]});
}
