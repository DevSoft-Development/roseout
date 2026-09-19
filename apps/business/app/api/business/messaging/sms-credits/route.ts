import { NextResponse } from "next/server";
import { getSmsCreditAllowance } from "@/lib/growth-pro/plan";
export async function GET(request: Request){const locationId=new URL(request.url).searchParams.get("locationId")||""; return NextResponse.json({included:getSmsCreditAllowance ? await getSmsCreditAllowance(locationId) : 0, remaining:0, message:"No unlimited SMS. Credits are required before sending."});}
