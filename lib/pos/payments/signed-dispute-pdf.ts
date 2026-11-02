import "server-only";
import {createHash} from "node:crypto";
import {inflateSync,deflateSync} from "node:zlib";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";
import {preparePosDisputeManifest} from "./dispute-packet";

/** Small dependency-free PDF renderer with an embedded, integrity-checked PNG signature. */
function readPng(buffer:Buffer){
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);
 if(buffer.length<64||!buffer.subarray(0,8).equals(signature))throw Error("invalid_signature_png");
 let width=0,height=0,depth=0,colorType=0,compression=0,filterMethod=0,interlace=0;
 let palette:Buffer|undefined;const frames:Buffer[]=[];
 let offset=8;
 while(offset+12<=buffer.length){
  const size=buffer.readUInt32BE(offset);const kind=buffer.toString("ascii",offset+4,offset+8);
  if(size>1048576||offset+12+size>buffer.length)throw Error("invalid_signature_png_chunks");
  const payload=buffer.subarray(offset+8,offset+8+size);
  if(kind==="IHDR"){width=payload.readUInt32BE(0);height=payload.readUInt32BE(4);depth=payload[8];colorType=payload[9];compression=payload[10];filterMethod=payload[11];interlace=payload[12];}
  if(kind==="IDAT")frames.push(payload);
  if(kind==="PLTE")palette=payload;
  offset+=size+12;
  if(kind==="IEND")break;
 }
 if(width<1||height<1||width>2200||height>1200||depth!==8||compression||filterMethod||interlace||![0,2,3,4,6].includes(colorType))throw Error("unsupported_signature_png");
 const channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[colorType];
 const stride=width*channels;
 if((stride+1)*height>12*1024*1024||!frames.length)throw Error("signature_png_exceeds_bounds");
 const inflated=inflateSync(Buffer.concat(frames),{maxOutputLength:(stride+1)*height+1});
 if(inflated.length!==(stride+1)*height)throw Error("signature_png_length_mismatch");
 const rgb=Buffer.alloc(width*height*3);let previous=Buffer.alloc(stride),cur=Buffer.alloc(stride);
 for(let y=0;y<height;y++){
  const start=y*(stride+1);const filter=inflated[start];
  if(filter>4)throw Error("invalid_signature_png_filter");
  for(let x=0;x<stride;x++){
   const left=x>=channels?cur[x-channels]:0,up=previous[x],upLeft=x>=channels?previous[x-channels]:0;
   let predictor=0;
   if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=Math.floor((left+up)/2);
   else if(filter===4){const p=left+up-upLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upLeft);predictor=a<=b&&a<=c?left:b<=c?up:upLeft;}
   cur[x]=(inflated[start+1+x]+predictor)&255;
  }
  for(let x=0;x<width;x++){
   let r=255,g=255,b=255,a=255;const n=x*channels;
   if(colorType===0){r=g=b=cur[n];}
   if(colorType===2){r=cur[n];g=cur[n+1];b=cur[n+2];}
   if(colorType===3){const i=cur[n]*3;if(!palette||i+2>=palette.length)throw Error("invalid_signature_palette");r=palette[i];g=palette[i+1];b=palette[i+2];}
   if(colorType===4){r=g=b=cur[n];a=cur[n+1];}
   if(colorType===6){r=cur[n];g=cur[n+1];b=cur[n+2];a=cur[n+3];}
   const dest=(y*width+x)*3;
   rgb[dest]=Math.round((r*a+255*(255-a))/255);rgb[dest+1]=Math.round((g*a+255*(255-a))/255);rgb[dest+2]=Math.round((b*a+255*(255-a))/255);
  }
  const swap=previous;previous=cur;cur=swap;
 }
 return {width,height,bytes:deflateSync(rgb)};
}

const escapeText=(v:unknown)=>String(v??"").replace(/[^\x20-\x7E]/g,"?").replace(/[()\\]/g,"\\$&");
const cash=(n:unknown)=>"$"+(Number(n||0)/100).toFixed(2);
function renderDocument(lines:string[],image?:{width:number;height:number;bytes:Buffer}){
 const chunks:Buffer[]=[];const offsets:number[]=[0];let total=0;
 const add=(s:string|Buffer)=>{const b=Buffer.isBuffer(s)?s:Buffer.from(s,"latin1");chunks.push(b);total+=b.length;};
 const obj=(n:number,s:string|Buffer)=>{offsets[n]=total;add(n+" 0 obj\n");add(s);add("\nendobj\n");};
 const pages:string[][]=[];
 for(let start=0;start<lines.length;start+=35)pages.push(lines.slice(start,start+35));
 if(!pages.length)pages.push([]);
 const imageId=image?5:0;
 const firstPage=image?6:5;
 const objects=firstPage+pages.length*2-1;
 add("%PDF-1.4\n");
 obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
 obj(2,"<< /Type /Pages /Kids ["+pages.map((_,i)=>(firstPage+i*2)+" 0 R").join(" ")+"] /Count "+pages.length+" >>");
 obj(3,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
 obj(4,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
 if(image){const header="<< /Type /XObject /Subtype /Image /Width "+image.width+" /Height "+image.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length "+image.bytes.length+" >>\nstream\n";obj(imageId,Buffer.concat([Buffer.from(header),image.bytes,Buffer.from("\nendstream")]));}
 pages.forEach((page,i)=>{
  const pageId=firstPage+i*2,contentId=pageId+1;
  const display=page.map((line,index)=>"BT /F1 10 Tf 50 "+(760-index*16)+" Td ("+escapeText(line.slice(0,100))+") Tj ET").join("\n");
  const showImage=image&&i===pages.length-1?
   "\nq "+Math.min(300,image.width)+" 0 0 "+Math.min(115,image.height)+" 50 44 cm /Sig Do Q":"";
  const stream=Buffer.from(display+showImage,"latin1");
  obj(pageId,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> "+(image?"/XObject << /Sig 5 0 R >>":"")+" >> /Contents "+contentId+" 0 R >>");
  obj(contentId,Buffer.concat([Buffer.from("<< /Length "+stream.length+" >>\nstream\n"),stream,Buffer.from("\nendstream")]));
 });
 const startXref=total;add("xref\n0 "+(objects+1)+"\n0000000000 65535 f \n");
 for(let n=1;n<=objects;n++)add(String(offsets[n]).padStart(10,"0")+" 00000 n \n");
 add("trailer\n<< /Root 1 0 R /Size "+(objects+1)+" >>\nstartxref\n"+startXref+"\n%%EOF");
 return Buffer.concat(chunks);
}

/** Only call after authenticated owner/manager checks and pre-download audit. */
export async function buildSignedPosDisputePdf(locationId:string,tenderId:string){
 const manifest=await preparePosDisputeManifest(locationId,tenderId);
 const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
 const found=await shard.client.from("pos_transaction_evidence")
  .select("storage_key,sha256_hex,content_type").eq("location_id",locationId).eq("tender_id",tenderId)
  .eq("evidence_type","customer_signature").limit(2);
 if(found.error||!found.data||found.data.length>1)throw Error("signature_evidence_invalid");
 let image:ReturnType<typeof readPng>|undefined;
 if(found.data.length){
  const signature=found.data[0];if(signature.content_type!=="image/png"||!signature.storage_key.startsWith("pos-evidence/"+locationId+"/"+tenderId+"/"))throw Error("signature_reference_invalid");
  const downloaded=await shard.client.storage.from("pos-transaction-evidence").download(signature.storage_key);
  if(downloaded.error||!downloaded.data)throw Error("signature_storage_unavailable");
  const bytes=Buffer.from(await downloaded.data.arrayBuffer());
  if(createHash("sha256").update(bytes).digest("hex")!==signature.sha256_hex)throw Error("signature_hash_mismatch");
  image=readPng(bytes);
 }
 const lines=["ThePOSHaven | Transaction Evidence",
  "Location: "+locationId,"Check: "+manifest.tender.check_id,"Tender: "+tenderId,
  "Generated: "+manifest.generatedAt,"Payment status: "+manifest.tender.status,
  "Check total: "+cash(manifest.check?.total_cents)+" | tax: "+cash(manifest.check?.tax_cents),
  "Tender amount: "+cash(manifest.tender.amount_cents)+" | Tip: "+cash(manifest.tender.tip_cents),
  "ITEMIZED RECEIPT"];
 manifest.items.forEach(i=>{lines.push(String(i.quantity)+" x "+String(i.item_name)+"  "+cash(i.line_total_cents)+"  seat "+String(i.seat_number??"-"));});
 lines.push("PAYMENT PROCESSOR RECORDS");
 manifest.payments.forEach(p=>{lines.push(String(p.provider)+" "+String(p.provider_payment_intent_id)+" "+String(p.status)+" "+cash(p.amount_cents));});
 lines.push("EVIDENCE HASHES");
 manifest.evidence.forEach(e=>lines.push(String(e.evidence_type)+" sha256 "+String(e.sha256_hex)));
 lines.push(image?"Verified stored customer signature shown below.":"No stored customer signature for this tender.");
 lines.push("Signature evidence is not proof of cardholder authorization by itself.");
 return renderDocument(lines,image);
}