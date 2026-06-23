import CrmWorkspaceNav from "./CrmWorkspaceNav";

export default function CrmWorkspaceShell({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.22),transparent_34%),#0d0d0f] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Admin CRM</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">CRM Workspace</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Manage business accounts, outreach, claims, support, and assigned work.</p>
        <div className="mt-5"><CrmWorkspaceNav /></div>
      </section>
      {children}
    </div>
  </div>;
}
