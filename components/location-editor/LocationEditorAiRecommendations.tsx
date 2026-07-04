"use client";
import type { LocationEditorContext } from "./location-editor-context";
type Form = Record<string, any>;
export function getLocationEditorRecommendations(form: Form) {
  const recs: Array<{priority:"High"|"Medium"|"Low"; title:string; detail:string; href:string}> = [];
  const image = form.main_image || form.image_url || (Array.isArray(form.images) && form.images[0]);
  if (!image) recs.push({ priority:"High", title:"Add a clear primary photo", detail:"Profiles with a strong first image are easier to trust and recognize.", href:"#photos" });
  if (!form.hours && !form.operating_hours) recs.push({ priority:"High", title:"Add or improve hours", detail:"Help guests know when this location is open.", href:"#hours" });
  if (!form.phone) recs.push({ priority:"Medium", title:"Add a phone number", detail:"Give visitors a direct way to contact the location.", href:"#details" });
  if (!form.website) recs.push({ priority:"Medium", title:"Add a website", detail:"Connect visitors to the official site when one exists.", href:"#details" });
  if (!form.description || String(form.description).length < 80) recs.push({ priority:"Medium", title:"Improve the description", detail:"Add a concise description of the experience, menu, or vibe.", href:"#public-profile" });
  if (form.is_searchable === "false") recs.push({ priority:"High", title:"Review hidden profile status", detail:"This profile is hidden from search results.", href:"#public-profile" });
  if (!form.cuisine && !form.activity_type) recs.push({ priority:"Low", title:"Add missing category details", detail:"Cuisine or activity type helps matching and discovery.", href:"#details" });
  recs.push({ priority:"Medium", title:"Publish menu", detail:"Create or publish the menu when this location has menu items.", href:"#menu" });
  recs.push({ priority:"Low", title:"Generate QR codes", detail:"Create profile, claim, and menu QR codes for this selected location.", href:"#qr-codes" });
  return recs;
}
export default function LocationEditorAiRecommendations({ form }: { context: LocationEditorContext; form: Form }) { const recs = getLocationEditorRecommendations(form); return <div className="grid gap-3">{recs.map((r)=><a key={r.title} href={r.href} className="rounded-3xl border border-white/10 bg-black/25 p-4 hover:bg-white/[.06]"><span className="rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-black uppercase text-rose-100">{r.priority}</span><h3 className="mt-3 font-black">{r.title}</h3><p className="mt-1 text-sm text-white/55">{r.detail}</p></a>)}</div> }
