import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import CheckoutPreview from "./CheckoutPreview";

export const dynamic = "force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function CheckoutPreviewPage({searchParams}:{searchParams:Promise<{
  locationId?:string;demo?:string;fromDemoCenter?:string;demoLocationId?:string;
}>}){
  const params=await searchParams;
  const locationId=String(params.locationId||params.demoLocationId||"");
  if(!UUID.test(locationId))redirect("/locations/dashboard");
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  const demo=params.demo==="1"||params.fromDemoCenter==="1";
  const internalDemo=demo?await getInternalDemoLocationAccess({
    locationId,demoLocationId:params.demoLocationId,demo,fromDemoCenter:params.fromDemoCenter==="1",
  }):null;
  if(!internalDemo){
    if(!user)redirect("/business/login");
    const access=await getLocationOwnerAccess(user.id,user.email);
    if(!access.isSuperadmin&&!access.ownedLocationIds.includes(locationId))redirect("/locations/dashboard");
  }
  return <CheckoutPreview/>;
}
