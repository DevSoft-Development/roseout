import CrmWorkspaceNav from "./CrmWorkspaceNav";

export default function CrmWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-w-0 overflow-x-hidden bg-[radial-gradient(circle_at_top_right,rgba(236,11,91,0.08),transparent_26%),#050505] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px] min-w-0 space-y-6">
        <section className="rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.16),transparent_34%),linear-gradient(135deg,#12090d,#090909_62%,#111114)] p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Admin CRM</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">CRM Workspace</h1>
              <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Manage business accounts, outreach, claims, support, and assigned work.</p>
            </div>
            <div className="min-w-0 xl:max-w-[56rem]"><CrmWorkspaceNav /></div>
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
