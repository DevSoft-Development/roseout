import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationMainImage } from "@/lib/admin-crm";
import ReserveBookingForm from "@/components/ReserveBookingForm";
import { getOptionalCurrentAdmin } from "@/lib/admin/admin-access";

export const dynamic = "force-dynamic";

export default async function ReservationEmbedPage({ params, searchParams }: { params: Promise<{ locationId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { locationId } = await params;
  const query = searchParams ? await searchParams : {};
  const preview = query.preview === "1";
  const type = typeof query.type === "string" ? query.type : undefined;
  const admin = preview ? await getOptionalCurrentAdmin() : null;
  const previewAllowed = preview && Boolean(admin);
  const { data: location } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  const enabled = Boolean(location?.reservation_embed_enabled || location?.reservation_enabled || location?.reservation_url || location?.external_reservation_url || location?.internal_reservations_enabled || location?.uses_internal_reservations);

  if (!location || (!enabled && !previewAllowed)) {
    return <main className="min-h-screen bg-[#090706] p-5 text-white"><section className="mx-auto flex min-h-[420px] max-w-2xl items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">TheOutHaven Reservations</p><h1 className="mt-3 text-3xl font-black">Reservations unavailable</h1><p className="mt-3 text-white/60">This location is not accepting reservations through TheOutHaven right now.</p></div></section></main>;
  }

  const name = location.name || location.location_name || "TheOutHaven location";
  const image = getLocationMainImage(location);

  return <main className="min-h-screen bg-[#090706] p-4 text-white sm:p-6"><section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#120d0c] shadow-2xl"><div className="relative h-48 bg-black">{image ? <img src={image} alt={name} className="h-full w-full object-cover" /> : null}<div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" /><div className="absolute bottom-5 left-5 right-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">TheOutHaven Reservations</p><h1 className="mt-2 text-3xl font-black">{name}</h1></div></div><div className="p-5"><ReserveBookingForm locationId={location.id} locationType={type || location.location_type || "restaurant"} locationName={name} defaultDuration={Number(location.default_duration_minutes || 90)} /></div></section></main>;
}
