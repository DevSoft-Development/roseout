import Link from "next/link";
import type { buildLocationEditorLinks } from "@/lib/location-editor-links";
import { cleanEditorHashNav, getCleanEditorActions } from "./editor-config";

type Links = ReturnType<typeof buildLocationEditorLinks>;
const navClass = "rounded-2xl px-3 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/[0.06] hover:text-white";

export default function LocationEditorNav({ links }: { links: Links }) {
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[280px] overflow-y-auto border-r border-white/10 bg-[#050607] px-4 py-5 shadow-2xl lg:block">
      <div className="mb-5 px-3">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff1654]">TheOutHaven</p>
        <h2 className="mt-2 text-xl font-black text-white">Location Editor</h2>
      </div>
      <nav className="space-y-6" aria-label="Location editor navigation">
        <div>
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Sections</p>
          <div className="mt-2 grid gap-1">
            {cleanEditorHashNav.map((item) => <Link key={item.href} href={item.href} className={navClass}>{item.label}</Link>)}
          </div>
        </div>
        <div>
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Quick Actions</p>
          <div className="mt-2 grid gap-1">
            {getCleanEditorActions(links).map((item) => <Link key={item.label} href={item.href} className={item.kind === "primary" ? `${navClass} border border-[#e1062a]/40 bg-[#e1062a]/15 text-white` : navClass}>{item.label}</Link>)}
          </div>
        </div>
      </nav>
    </aside>
  );
}
