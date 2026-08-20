import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function ExperienceBookingPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: booking } = await supabaseAdmin
    .from("experience_bookings")
    .select("id,experience_id,slot_id,customer_name,party_size,status,checkin_code,checked_in_count,public_token")
    .eq("public_token", token)
    .maybeSingle();
  if (!booking) notFound();
  const [{ data: experience }, { data: slot }] = await Promise.all([
    supabaseAdmin.from("experiences").select("title,venue_name,address,city,state,zip_code,image_url").eq("id", booking.experience_id).maybeSingle(),
    supabaseAdmin.from("experience_slots").select("starts_at,ends_at").eq("id", booking.slot_id).maybeSingle(),
  ]);
  if (!experience || !slot) notFound();

  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white">
    <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.04] p-6 shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Experience Check-in Pass</p>
      <h1 className="mt-3 text-3xl font-black">{experience.title}</h1>
      <p className="mt-2 text-white/55">{new Date(slot.starts_at).toLocaleString()}</p>
      <p className="mt-1 text-sm text-white/45">{[experience.venue_name, experience.address, experience.city, experience.state, experience.zip_code].filter(Boolean).join(" · ")}</p>
      <div className="mt-6 rounded-2xl bg-white p-4 text-center text-black">
        <Image src={`/api/experience-bookings/${booking.public_token}/qr`} alt="Experience booking QR code" width={320} height={320} unoptimized className="mx-auto" />
        <p className="mt-3 text-xs font-bold uppercase tracking-[.16em] text-black/50">Backup check-in code</p>
        <p className="mt-1 text-3xl font-black tracking-[.25em]">{booking.checkin_code}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/10 p-4"><span className="text-white/45">Guest</span><p className="mt-1 font-black">{booking.customer_name}</p></div>
        <div className="rounded-2xl border border-white/10 p-4"><span className="text-white/45">Party</span><p className="mt-1 font-black">{booking.checked_in_count}/{booking.party_size} checked in</p></div>
      </div>
      <p className="mt-5 text-sm text-white/45">Show this QR at check-in. If scanning is unavailable, staff can enter the backup code.</p>
      <Link href="/experiences" className="mt-6 inline-block text-sm font-black text-[#ff5570]">Browse more experiences →</Link>
    </div>
  </main>;
}
