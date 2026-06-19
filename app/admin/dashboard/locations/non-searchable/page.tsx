import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_MARKET_STATES, evaluateLocationPublishability } from "@/lib/location-publishability";
import NonSearchableClient from "./NonSearchableClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Non-Searchable Locations" };
const SELECT = "id,name,state,status,data_status,quality_status,source_quality_status,import_confidence,public_visibility_tier,duplicate_status,is_searchable,is_hidden,is_low_level,has_photos,photo_status,main_image,image_url,images,address,city,latitude,longitude,location_type";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireAdminRole(["superadmin", "admin"]);
  const sp = await searchParams;
  let q = supabaseAdmin.from("locations").select(SELECT).eq("is_searchable", false).limit(100).order("updated_at", { ascending:false });
  if (sp.state) q = q.eq("state", sp.state); else q = q.in("state", [...ACTIVE_MARKET_STATES]);
  if (sp.locationType) q = q.eq("location_type", sp.locationType);
  if (sp.city) q = q.ilike("city", `%${sp.city}%`);
  if (sp.query) q = q.or(`name.ilike.%${sp.query}%,address.ilike.%${sp.query}%`);
  const { data=[] } = await q;
  const rows = (data || []).map((row:any)=>({ ...row, publishability: evaluateLocationPublishability(row, { allowApproval:true }) }));
  return <main className="min-h-screen bg-[#08050b] p-6 text-white"><div className="mx-auto max-w-7xl space-y-6"><div><Link href="/admin/dashboard/locations" className="text-sm text-rose-200">← Locations</Link><h1 className="mt-3 text-4xl font-black">Non-Searchable Locations</h1><p className="mt-2 text-white/60">Review locations that are not currently public/searchable, understand why, and safely approve eligible rows.</p></div><NonSearchableClient rows={rows} filters={{state:sp.state, locationType:sp.locationType, city:sp.city, query:sp.query}} /></div></main>;
}
