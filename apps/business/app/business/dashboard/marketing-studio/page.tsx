import Link from "next/link";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <BusinessGrowthProPage module="marketing-studio" searchParams={searchParams} />
      <div className="fixed bottom-6 right-6 z-50">
        <Link href="/business/dashboard/marketing-studio/media-permissions" className="inline-flex min-h-12 items-center rounded-full border border-white/15 bg-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-2xl shadow-black/40 transition hover:scale-[1.02]">
          Media Permissions
        </Link>
      </div>
    </>
  );
}
