import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import PrintButton from "./PrintButton";

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

function formatAddress(location: ClaimQrLocation) {
  const cityStateZip = [location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(", ");

  return [location.address, cityStateZip].filter(Boolean).join(" • ") || "Address not listed";
}

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
            <PrintButton />
            <Link
              href="/admin/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <section className="qr-sheet mt-6 grid gap-4 rounded-[2rem] border border-white/10 bg-white p-4 text-black shadow-2xl print:mt-0 print:rounded-none print:p-0 md:grid-cols-2 print:grid-cols-2">
          {locations.map((location) => (
            <div
              key={`${location.type}-${location.id}`}
              className="qr-card grid min-h-[190px] grid-cols-[155px_1fr] gap-4 rounded-3xl border border-black/10 bg-white p-5"
            >
              <div className="flex items-center justify-center rounded-2xl border border-black/10 bg-white p-2">
                {location.qr_code_data_url ? (
                  <img
                    src={location.qr_code_data_url}
                    alt={`Claim QR for ${location.name || "location"}`}
                    className="h-32 w-32 object-contain"
                  />
                ) : (
                  <div className="text-xs font-black text-black/35">No QR</div>
                )}
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700">
                  TheOutHaven Claim
                </p>
                <h2 className="mt-2 text-2xl font-black leading-tight">
                  {location.name || "Untitled location"}
                </h2>
                <p className="mt-3 text-sm font-bold leading-6 text-black/60">
                  {formatAddress(location)}
                </p>
                {location.claim_url && (
                  <p className="mt-3 break-all text-[10px] font-bold text-black/35">
                    {location.claim_url}
                  </p>
                )}
              </div>
            </div>
          ))}

          {locations.length === 0 && (
            <div className="p-8 text-center text-sm font-bold text-black/45">
              No claim QR codes found. Import or create locations to generate claim QR codes.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
