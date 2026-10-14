import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase-server";
import {getLocationOwnerAccess} from "@/lib/auth/locationOwnerAccess";
import {auditPosEvidenceAccess} from "@/lib/pos/payments/evidence-access-audit";
import {buildSignedPosDisputePdf} from "@/lib/pos/payments/signed-dispute-pdf";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const common={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const failure=(status:number,code:string)=>NextResponse.json({error:code},{status,headers:common});
export async function GET(request:NextRequest){
 const locationId=request.nextUrl.searchParams.get("locationId")||"";
 const tenderId=request.nextUrl.searchParams.get("tenderId")||"";
 if(!UUID.test(locationId)||!UUID.test(tenderId))return failure(400,"invalid_identifier");
 const auth=await createClient();
 const {data:{user}}=await auth.auth.getUser();
 if(!user)return failure(401,"unauthorized");
 const access=await getLocationOwnerAccess(user.id,user.email);
 if(!access.isSuperadmin&&!access.ownedLocationIds.includes(locationId))return failure(403,"forbidden");
 if(process.env.POS_SIGNED_DISPUTE_PDF_ENABLED!=="true")return failure(503,"signed_pdf_not_certified");
 try{
  // Audit before private download, fail closed if audit service is unavailable.
  await auditPosEvidenceAccess({locationId,tenderId,actorUserId:user.id,action:"export_packet",result:"allowed"});
  const pdf=await buildSignedPosDisputePdf(locationId,tenderId);
  return new NextResponse(new Uint8Array(pdf),{headers:{
   ...common,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="pos-dispute-evidence.pdf"',
   "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; sandbox"
  }});
 }catch{return failure(503,"signed_pdf_unavailable");}
}
