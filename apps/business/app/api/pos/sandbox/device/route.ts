import {NextResponse} from "next/server";
import {getInternalDemoLocationAccess} from "@/lib/demo/internal-demo-location-access";
import {issueSandboxVirtualDevice,revokeSandboxVirtualDevice,SANDBOX_LOUNGE_ID} from "@/lib/pos/sandbox-virtual-device";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers});

async function authorize(request:Request){
 const origin=request.headers.get("origin");
 if(!origin||new URL(origin).origin!==new URL(request.url).origin)throw Error("invalid_origin");
 const access=await getInternalDemoLocationAccess({locationId:SANDBOX_LOUNGE_ID,demo:true,fromDemoCenter:true});
 if(!access || !["superadmin","admin"].includes(access.viewer.role))throw Error("unauthorized");
 // Signed Admin handoff by itself is insufficient for issuance: require a user-bound session.
 const viewer=access.viewer;
 if("demoHandoff" in viewer)throw Error("admin_session_required");
 return {locationId:access.locationId,userId:viewer.user.id};
}
export async function POST(request:Request){
 try {
  const operator=await authorize(request);
  const result=await issueSandboxVirtualDevice({locationId:operator.locationId,issuedBy:operator.userId});
  return reply({ok:true,...result});
 }catch{return reply({ok:false,error:"sandbox_device_unavailable"},403);}
}
export async function DELETE(request:Request){
 try{
  const operator=await authorize(request);
  const body=await request.json();
  if(typeof body?.deviceId!=="string")return reply({ok:false,error:"invalid_device_id"},400);
  const result=await revokeSandboxVirtualDevice({locationId:operator.locationId,deviceId:body.deviceId,revokedBy:operator.userId});
  return reply({ok:true,...result});
 }catch{return reply({ok:false,error:"sandbox_device_unavailable"},403);}
}
