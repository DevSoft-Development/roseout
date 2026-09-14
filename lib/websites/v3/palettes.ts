import type { WebsiteV3ConceptId } from "@/lib/websites/v3/catalog";
import type { V3PageProfile } from "@/lib/websites/v3/artifact";

export type WebsiteV3PaletteId = "original" | "midnight" | "champagne" | "emerald" | "burgundy" | "ivory";
export const WEBSITE_V3_PALETTES:{id:WebsiteV3PaletteId;name:string;swatches:[string,string,string]}[]=[
 {id:"original",name:"Original",swatches:["#111111","#f4eee5","#cbaa73"]},
 {id:"midnight",name:"Midnight",swatches:["#08101c","#eef4ff","#7fb4ff"]},
 {id:"champagne",name:"Champagne",swatches:["#2b241d","#f4eadb","#c6a46d"]},
 {id:"emerald",name:"Emerald",swatches:["#0d2a22","#eef4ed","#70a987"]},
 {id:"burgundy",name:"Burgundy",swatches:["#35131b","#f7e9e8","#c78b7f"]},
 {id:"ivory",name:"Ivory",swatches:["#f6f1e8","#26231f","#a3815d"]},
];
export function normalizeWebsiteV3Palette(value:unknown):WebsiteV3PaletteId{return WEBSITE_V3_PALETTES.some(x=>x.id===value)?value as WebsiteV3PaletteId:"original"}
export function paletteProfile(base:V3PageProfile,id:WebsiteV3PaletteId):V3PageProfile{
 if(id==="original")return base;
 const presets:Record<Exclude<WebsiteV3PaletteId,"original">,Pick<V3PageProfile,"background"|"foreground"|"muted"|"accent"|"panel">>={
  midnight:{background:"#08101c",foreground:"#eef4ff",muted:"#9aaac0",accent:"#7fb4ff",panel:"#121d2a"},
  champagne:{background:"#201b17",foreground:"#f4eadb",muted:"#baa995",accent:"#c6a46d",panel:"#302821"},
  emerald:{background:"#0d2a22",foreground:"#eef4ed",muted:"#a7b8ae",accent:"#70a987",panel:"#173a30"},
  burgundy:{background:"#35131b",foreground:"#f7e9e8",muted:"#c6aaa9",accent:"#c78b7f",panel:"#491c26"},
  ivory:{background:"#f6f1e8",foreground:"#26231f",muted:"#786f65",accent:"#a3815d",panel:"#e8dfd2"},
 };
 return {...base,...presets[id]};
}
function re(s:string){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
export function recolorV3Html(html:string,from:V3PageProfile,to:V3PageProfile){
 let next=html; for(const key of ["background","foreground","muted","accent","panel"] as const){const a=from[key],b=to[key];if(a!==b)next=next.replace(new RegExp(re(a),"gi"),b)} return next;
}
export function paletteForConcept(_concept:WebsiteV3ConceptId,id:WebsiteV3PaletteId,base:V3PageProfile){return paletteProfile(base,id)}
