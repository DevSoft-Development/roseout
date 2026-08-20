import { notFound } from "next/navigation";
import ExperienceBookingForm from "./ExperienceBookingForm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: experience } = await supabaseAdmin.from("experiences").select("*").eq("id", id).eq("status", "published").eq("searchable", true).maybeSingle();
  if (!experience) notFound();
  const { data: slots, error } = await supabaseAdmin.from("experience_slots").select("id,starts_at,ends_at,capacity").eq("experience_id", id).eq("status", "open").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30);
  if (error) throw error;
  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_380px]">
    <section>{experience.image_url ? <div className="h-[360px] rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${experience.image_url})` }} /> : null}<p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">{experience.category || "Experience"}</p><h1 className="mt-2 text-4xl font-black">{experience.title}</h1><p className="mt-4 whitespace-pre-wrap text-white/60">{experience.description}</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label="Duration" value={`${experience.duration_minutes} min`} /><Stat label="Party size" value={`${experience.min_party_size}–${experience.max_party_size}`} /><Stat label="Price" value={Number(experience.price_per_person) > 0 ? `$${Number(experience.price_per_person).toFixed(2)}/person` : "Free"} /></div><p className="mt-6 text-sm text-white/45">{[experience.venue_name, experience.address, experience.city, experience.state, experience.zip_code].filter(Boolean).join(" · ")}</p></section>
    <aside><ExperienceBookingForm experienceId={id} slots={slots || []} minParty={experience.min_party_size} maxParty={experience.max_party_size} /></aside>
  </div></main>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-white/40">{label}</p><p className="mt-1 font-black">{value}</p></div>; }
