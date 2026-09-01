import type { Metadata } from "next";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";
import { PlatformDrPanel } from "@/components/admin/PlatformDrPanel";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Failover & DR | Cloud Infrastructure | Admin",
  description: "Cross-cloud application failover readiness and controlled production DR testing for TheOutHaven.",
};

export const dynamic = "force-dynamic";

export default async function PlatformFailoverPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud Infrastructure"
        title="Failover & DR"
        subtitle="Keep the public site, admin, and location dashboard on one shared failover path: Vercel primary, AWS warm standby, Route 53 health routing, and the current Virginia → Oregon Supabase DR topology."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/infrastructure" variant="primary">Cloud Infrastructure</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/website-hosting/testing">Customer website DR</AdminActionButton>
          </>
        }
      />

      <AdminSectionCard className="p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Primary app</p>
            <p className="mt-2 text-xl font-black text-white">Vercel</p>
            <p className="mt-1 text-sm leading-6 text-white/50">Normal production traffic for all three application surfaces.</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Warm standby</p>
            <p className="mt-2 text-xl font-black text-white">AWS us-west-2</p>
            <p className="mt-1 text-sm leading-6 text-white/50">Same Next.js revision in ECS Fargate behind CloudFront.</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Traffic switch</p>
            <p className="mt-2 text-xl font-black text-white">Route 53</p>
            <p className="mt-1 text-sm leading-6 text-white/50">Fast health checks move both apex and www to AWS together.</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Database DR</p>
            <p className="mt-2 text-xl font-black text-white">Virginia → Oregon</p>
            <p className="mt-1 text-sm leading-6 text-white/50">Database promotion remains a separate guarded operation to prevent split-brain.</p>
          </div>
        </div>
      </AdminSectionCard>

      <PlatformDrPanel />
    </AdminPageShell>
  );
}
