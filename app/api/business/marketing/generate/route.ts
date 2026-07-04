import { NextResponse } from "next/server";
import { requireLocationPermission } from "@/lib/location-access";
export async function POST(request: Request){
  const body=await request.json().catch(()=>({}));
  const { context: ctx, error } = await requireLocationPermission({ request, body, requiredPermission: "marketing.edit", allowDemoPreview: true });
  if(error) return error;
  const loc=ctx.location as any; const contentType=String(body.contentType||"Instagram caption"); const goal=String(body.goal||"weekend visits");
  const name=String(loc.name||loc.restaurant_name||loc.activity_name||body.name||"this location");
  const area=String(loc.neighborhood||loc.city||body.neighborhood||"nearby");
  const category=String(loc.primary_category||loc.category||loc.cuisine||loc.activity_type||body.category||"night-out spot");
  const copy=`${contentType} for ${name}\n\nLooking for a ${category} in ${area}? Plan your next visit to ${name} and check out the latest profile details, hours, menu, offers, and QR-friendly updates on TheOutHaven.\n\nGoal: ${goal}.`;
  return NextResponse.json({copy,draft:{headline:`Bring more guests to ${name}`,body:copy},locationId:ctx.locationId});
}
