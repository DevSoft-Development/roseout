"use client";
import { useState } from "react";
import { toSelectedLocationRequestContext, type LocationEditorContext } from "./location-editor-context";
type Form = Record<string, any>;
type Patch = Record<string, string | string[]>;
const fields = ["primary_tag","primary_category","cuisine","activity_type","tags","semantic_tags","best_for_tags","best_for","vibe_tags","date_style_tags","intent_tags","special_features","search_keywords","short_description","description"];
function join(v:any){return Array.isArray(v)?v.join(", "):String(v??"");}
export function getLocationEditorRecommendations(form: Form) {
  const recs: Array<{priority:"High"|"Medium"|"Low"; title:string; detail:string; href:string}> = [];
  const image = form.main_image || form.image_url || (Array.isArray(form.images) && form.images[0]);
  if (!image) recs.push({ priority:"High", title:"Add a clear primary photo", detail:"Profiles with a strong first image are easier to trust and recognize.", href:"#photos" });
  if (!form.hours && !form.operating_hours) recs.push({ priority:"High", title:"Add or improve hours", detail:"Help guests know when this location is open.", href:"#hours" });
  if (!form.description || String(form.description).length < 80) recs.push({ priority:"Medium", title:"Improve the description", detail:"Add a concise description of the experience, menu, or vibe.", href:"#search-enhancements" });
  if (!form.cuisine && !form.activity_type) recs.push({ priority:"Low", title:"Add category details", detail:"Cuisine or activity type helps matching and discovery.", href:"#search-enhancements" });
  return recs;
}
export default function LocationEditorAiRecommendations({ context, form, onApply, targetSection }: { context: LocationEditorContext; form: Form; onApply?: (patch: Patch)=>void; targetSection?: string }) {
  const [suggestions,setSuggestions]=useState<Patch|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function suggest(){setBusy(true);setMessage("");try{const res=await fetch("/api/locations/optimize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...toSelectedLocationRequestContext(context),...form})});const json=await res.json();if(!res.ok) throw new Error(json.error||"Suggestions are unavailable right now.");setSuggestions(json.suggestions||{});}catch(e:any){setMessage(e.message||"Suggestions are unavailable right now.");}finally{setBusy(false)}}
  const recs=getLocationEditorRecommendations(form);
  return <div className="grid gap-4" data-target-section={targetSection}><div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5"><h3 className="text-xl font-black">Recommended Details</h3><p className="mt-2 text-sm text-white/60">Suggest Improvements reviews this profile and prepares safe search fields. Apply updates to the form, then click Save Changes when you are ready.</p><button type="button" onClick={suggest} disabled={busy} className="mt-4 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-60">{busy?"Suggesting…":"Suggest Improvements"}</button>{message?<p className="mt-3 text-sm font-bold text-amber-100">{message}</p>:null}</div>{suggestions&&Object.keys(suggestions).length?<div className="rounded-3xl border border-white/10 bg-black/25 p-5"><h4 className="font-black">Generated suggestions</h4><div className="mt-3 grid gap-2">{fields.filter(f=>suggestions[f]).map(f=><div key={f} className="rounded-2xl bg-white/[.04] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">{f.replaceAll("_"," ")}</p><p className="mt-1 text-sm text-white/75">{join(suggestions[f])}</p></div>)}</div><button type="button" onClick={()=>onApply?.(Object.fromEntries(Object.entries(suggestions).map(([k,v])=>[k,join(v)])))} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-black text-black">Apply suggestions to form</button></div>:null}<div className="grid gap-3 sm:grid-cols-2">{recs.map((r)=><a key={r.title} href={r.href} className="rounded-3xl border border-white/10 bg-black/25 p-4 hover:bg-white/[.06]"><span className="rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-black uppercase text-rose-100">{r.priority}</span><h3 className="mt-3 font-black">{r.title}</h3><p className="mt-1 text-sm text-white/55">{r.detail}</p></a>)}</div></div>
}
