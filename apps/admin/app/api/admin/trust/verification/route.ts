import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { reviewOrganizationVerification, reviewOrganizerVerification } from "@/lib/organizations/admin-verification";

const READ_ROLES=["superadmin","admin","ambassador","experience_team","viewer"] as const;
const WRITE_ROLES=["superadmin","admin"] as const;
const ORGANIZATION_VERIFICATION_FIELDS="id,organization_id,submitted_by_user_id,legal_name,website,contact_email,contact_phone,evidence,status,review_notes,reviewed_by_user_id,reviewed_at,created_at,updated_at" as const;
const ORGANIZER_VERIFICATION_FIELDS="id,organization_id,organizer_profile_id,submitted_by_user_id,experience_summary,social_links,evidence,status,requested_trust_level,approved_trust_level,review_notes,reviewed_by_user_id,reviewed_at,created_at,updated_at" as const;

export async function GET(req:Request){
  const admin=await getCurrentAdminOrNull();
  if(!admin)return NextResponse.json({error:"unauthorized"},{status:401});
  if(!READ_ROLES.includes(admin.role as (typeof READ_ROLES)[number]))return NextResponse.json({error:"forbidden"},{status:403});
  const db=getAdminDatabaseClient();
  const type=new URL(req.url).searchParams.get("type")==="organizer"?"organizer":"organization";
  const result=type==="organizer"
    ? await db.from("organizer_verification_requests").select(ORGANIZER_VERIFICATION_FIELDS).in("status",["pending","needs_more_info"]).order("created_at",{ascending:true}).limit(200)
    : await db.from("organization_verification_requests").select(ORGANIZATION_VERIFICATION_FIELDS).in("status",["pending","needs_more_info"]).order("created_at",{ascending:true}).limit(200);
  if(result.error)return NextResponse.json({error:result.error.message},{status:500});
  const requests=result.data||[];
  const organizationIds=Array.from(new Set(requests.map((row:any)=>row.organization_id).filter(Boolean)));
  const {data:organizations}=organizationIds.length
    ? await db.from("organizations").select("id,name,legal_name,organization_type,verification_status,trust_level").in("id",organizationIds)
    : {data:[] as any[]};
  const organizationMap=new Map((organizations||[]).map((row:any)=>[row.id,row]));
  return NextResponse.json({success:true,type,requests:requests.map((row:any)=>({...row,organization:organizationMap.get(row.organization_id)||null}))});
}

export async function POST(req:Request){
  const admin=await getCurrentAdminOrNull();
  if(!admin)return NextResponse.json({error:"unauthorized"},{status:401});
  if(!WRITE_ROLES.includes(admin.role as (typeof WRITE_ROLES)[number]))return NextResponse.json({error:"forbidden"},{status:403});
  try{
    const body=await req.json();
    const type=body?.type==="organizer"?"organizer":"organization";
    const decision=String(body?.decision||"");
    if(!["approved","rejected","needs_more_info"].includes(decision))return NextResponse.json({error:"Invalid decision."},{status:400});
    const requestId=String(body?.requestId||"").trim();
    if(!requestId)return NextResponse.json({error:"Verification request is required."},{status:400});
    const notes=typeof body?.notes==="string"?body.notes.trim()||null:null;
    if(type==="organizer"){
      await reviewOrganizerVerification({actorUserId:admin.user_id,requestId,decision:decision as any,notes,approvedTrustLevel:Number(body.approvedTrustLevel||1)});
    }else{
      await reviewOrganizationVerification({actorUserId:admin.user_id,requestId,decision:decision as any,notes});
    }
    return NextResponse.json({success:true});
  }catch(error:any){
    return NextResponse.json({error:error?.message||"Unable to review verification."},{status:400});
  }
}
