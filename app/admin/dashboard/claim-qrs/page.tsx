import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ClaimQrPrintClient from "./ClaimQrPrintClient";

type ClaimQrLocation = {
  id: string;
  type: "restaurants" | "activities";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  claim_url: string | null;
  qr_code_data_url: string | null;
};

export default async function AdminClaimQrPrintPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const [restaurantsResult, activitiesResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, restaurant_name, address, city, state, zip_code, claim_url, qr_code_data_url")
      .not("qr_code_data_url", "is", null)
      .order("restaurant_name", { ascending: true })
      .limit(200),
    supabase
      .from("activities")
      .select("id, activity_name, address, city, state, zip_code, claim_url, qr_code_data_url")
      .not("qr_code_data_url", "is", null)
      .order("activity_name", { ascending: true })
      .limit(200),
  ]);

  const locations: ClaimQrLocation[] = [
    ...(restaurantsResult.data || []).map((restaurant) => ({
      id: restaurant.id,
      type: "restaurants" as const,
      name: restaurant.restaurant_name,
      address: restaurant.address,
      city: restaurant.city,
      state: restaurant.state,
      zip_code: restaurant.zip_code,
      claim_url: restaurant.claim_url,
      qr_code_data_url: restaurant.qr_code_data_url,
    })),
    ...(activitiesResult.data || []).map((activity) => ({
      id: activity.id,
      type: "activities" as const,
      name: activity.activity_name,
      address: activity.address,
      city: activity.city,
      state: activity.state,
      zip_code: activity.zip_code,
      claim_url: activity.claim_url,
      qr_code_data_url: activity.qr_code_data_url,
    })),
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white print:bg-white print:px-0 print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .qr-sheet { box-shadow: none !important; border: 0 !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #111 !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[1200px] print:max-w-none">
        <section className="no-print rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Claim QR Printing
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Print Claim QR Codes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Print-ready claim labels formatted with QR code on the left and the
            location name plus full address on the right.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/admin/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <ClaimQrPrintClient locations={locations} />
      </div>
    </main>
  );
}
