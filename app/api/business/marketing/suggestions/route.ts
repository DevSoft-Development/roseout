import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({suggestions:[{title:"Promote a weekend offer",channel:"Email or social",cta:"Claim offer"},{title:"Grow your VIP list from QR scans",channel:"QR promo",cta:"Join VIP"}]});}
