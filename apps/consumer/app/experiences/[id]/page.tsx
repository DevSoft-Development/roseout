import { notFound, redirect } from "next/navigation";
import ExperienceBookingForm from "./ExperienceBookingForm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function priceLabel(experience:any){
  const model=String(experience.pricing_model||"per_person");
  if(model==="free")return "Free";
  if(model==="per_table")return `$${Number(experience.price_per_table||0).toFixed(2)} per table${experience.seats_per_table?` · up to ${experience.seats_per_table} guests/table`:""}`;
  if(model==="fixed_package")return `$${Number(experience.price_per_table||0).toFixed(2)} per package`;
  return Number(experience.price_per_person)>0?`$${Number(experience.price_per_person).toFixed(2)} per person`:"Free";
}

export default async function ExperiencePage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;
  const query=supabaseAdmin.from("experiences").select("*").eq("status","published").eq("searchable",true);
  const {data:experience}=UUID_RE.test(id)?await query.eq("id",id).maybeSingle():await query.ilike("slug",id).maybeSingle();
  if(!experience)notFound();
  if(UUID_RE.test(id)&&experience.slug)redirect(`/experiences/${experience.slug}`);
  const {data:slots,error}=await supabaseAdmin.from("experience_slots").select("id,starts_at,ends_at,capacity,tables_available").eq("experience_id",experience.id).eq("status","open").gte("starts_at",new Date().toISOString()).order("starts_at").limit(30);
  if(error)throw error;
  const qs=searchParams?await searchParams:{};
  const payment=Array.isArray(qs.payment)?qs.payment[0]:qs.payment;
  const pricing=priceLabel(experience);
  const groupDining=experience.experience_type==="group_dining";
  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_380px]"><section>{experience.image_url?<div className="h-[360px] rounded-3xl bg-cover bg-center" style={{backgroundImage:`url(${experience.image_url})`}}/>:null}<div className="mt-6 flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">{experience.category||"Experience"}</p>{groupDining?<span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-200">Group Dining · Prepaid Experience</span>:null}</div><h1 className="mt-2 text-4xl font-black">{experience.title}</h1><p className="mt-4 whitespace-pre-wrap text-white/60">{experience.description}</p>{payment==="success"?<div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">Payment received. Your booking confirmation and check-in pass will be issued as Stripe finishes confirmation.</div>:payment==="cancelled"?<div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Payment was cancelled. No prepaid booking was confirmed.</div>:null}<div className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label="Duration" value={`${experience.duration_minutes} min`}/><Stat label="Party size" value={`${experience.min_party_size}–${experience.max_party_size}`}/><Stat label="Price" value={pricing}/></div>{experience.cancellation_policy?<div className="mt-5 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs font-black uppercase tracking-[.14em] text-white/35">Cancellation / refund policy</p><p className="mt-2 text-sm leading-6 text-white/60">{experience.cancellation_policy}</p></div>:null}<p className="mt-6 text-sm text-white/45">{[experience.venue_name,experience.address,experience.city,experience.state,experience.zip_code].filter(Boolean).join(" · ")}</p></section><aside><ExperienceBookingForm experienceId={experience.id} slots={slots||[]} minParty={experience.min_party_size} maxParty={experience.max_party_size} pricingLabel={pricing} prepaymentRequired={Boolean(experience.prepayment_required)}/></aside></div></main>;
}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-white/40">{label}</p><p className="mt-1 font-black">{value}</p></div>}
