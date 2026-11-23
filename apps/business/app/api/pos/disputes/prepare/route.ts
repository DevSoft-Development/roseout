import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase-server";
import {getLocationOwnerAccess} from "@/lib/auth/locationOwnerAccess";
import {prepareDisputeReview} from "@/lib/pos/payments/dispute-case-review";
export const runtime="nodejs";export const dynamic="force-dynamic";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers={"Cache-Control":"private, no-store"};
export async function POST(req:NextRequest){
 if(process.env.POS_DISPUTE_MANAGER_APPROVAL_ENABLED!=="true")
  return NextResponse.json({error:"dispute_review_not_certified"},{status:503,headers});
 if(!req.headers.get("origin")||req.headers.get("origin")!==new URL(req.url).origin)
  return NextResponse.json({error:"invalid_origin"},{status:403,headers});
 let body:{locationId?:string;disputeId?:string};
 try{const raw=await req.text();if(raw.length>1024)throw Error();body=JSON.parse(raw);}
 catch{return NextResponse.json({error:"invalid_payload"},{status:400,headers});}
 if(!UUID.test(String(body.locationId||""))||!UUID.test(String(body.disputeId||"")))
  return NextResponse.json({error:"invalid_identifier"},{status:400,headers});
 const auth=await createClient();const {data:{user}}=await auth.auth.getUser();
 if(!user)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const a=await getLocationOwnerAccess(user.id,user.email);
 if(!a.isSuperadmin&&!a.ownedLocationIds.includes(String(body.locationId)))
  return NextResponse.json({error:"forbidden"},{status:403,headers});
 try{
  const result=await prepareDisputeReview({
   locationId:String(body.locationId),disputeId:String(body.disputeId),actorUserId:user.id
  });
  return NextResponse.json({ok:true,...result},{headers});
 }catch{return NextResponse.json({error:"dispute_preparation_unavailable"},{status:503,headers});}
}
