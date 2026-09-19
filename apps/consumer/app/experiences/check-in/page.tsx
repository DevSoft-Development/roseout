import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import CheckInClient from "./CheckInClient";

export const dynamic = "force-dynamic";

export default async function ExperienceCheckInPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent("/experiences/check-in")}`);
  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white"><div className="mx-auto max-w-3xl"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Experience Operations</p><h1 className="mt-2 text-3xl font-black">Guest Check-in</h1><p className="mt-2 mb-6 text-sm text-white/50">Scan the booking QR or enter the 6-character backup code. Access is enforced against the booking’s location or organization.</p><CheckInClient /></div></main>;
}
