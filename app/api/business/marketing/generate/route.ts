import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveSelectedLocationAccess } from "@/lib/auth/selectedLocationAccess";
export async function POST(request: Request){
  const body=await request.json().catch(()=>({}));
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({message:"Not signed in"},{status:401});
  const ctx=await resolveSelectedLocationAccess({...body,userId:user.id});
  if(!ctx.ok) return NextResponse.json({message:ctx.status===404?"You do not have access to this location.":ctx.message},{status:ctx.status===404?403:ctx.status});
  const loc=ctx.location; const contentType=String(body.contentType||"Instagram caption"); const goal=String(body.goal||"weekend visits");
  const name=String(loc.name||loc.restaurant_name||loc.activity_name||body.name||"this location");
  const area=String(loc.neighborhood||loc.city||body.neighborhood||"nearby");
  const category=String(loc.primary_category||loc.category||loc.cuisine||loc.activity_type||body.category||"night-out spot");
  const copy=`${contentType} for ${name}\n\nLooking for a ${category} in ${area}? Plan your next visit to ${name} and check out the latest profile details, hours, menu, offers, and QR-friendly updates on TheOutHaven.\n\nGoal: ${goal}.`;
  return NextResponse.json({copy,draft:{headline:`Bring more guests to ${name}`,body:copy},locationId:ctx.canonicalLocationId});
}
