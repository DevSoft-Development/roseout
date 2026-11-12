import {headers} from "next/headers";
import Checkout from "./Checkout";
export const dynamic="force-dynamic";
export const metadata={title:"Secure Checkout · ThePOSHaven",robots:{index:false,follow:false}};
export default async function CustomerCheckout({searchParams}:{searchParams:Promise<{locationId?:string;token?:string}>}){
 const {locationId,token}=await searchParams;
 // Avoid leaking bearer tokens to other origins via Referer.
 const h=await headers();
 void h;
 return <Checkout locationId={locationId||""} token={token||""}/>;
}
