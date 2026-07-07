import type { buildLocationEditorLinks } from "@/lib/location-editor-links";
import { cleanEditorHashNav, getCleanEditorActions } from "./editor-config";

type Links = ReturnType<typeof buildLocationEditorLinks>;

const navClass = "group flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white";
const activeClass = "border border-[#ff2142]/35 bg-gradient-to-r from-[#e1062a]/35 to-[#ff1654]/10 text-white shadow-lg shadow-[#e1062a]/10";

function iconFor(label: string) {
  const key = label.toLowerCase();
  if (key.includes("overview")) return "⌂";
  if (key.includes("details")) return "▣";
  if (key.includes("public")) return "◎";
  if (key.includes("search")) return "⌕";
  if (key.includes("photo")) return "▧";
  if (key.includes("hour")) return "◷";
  if (key.includes("menu")) return "Ⅲ";
  if (key.includes("qr")) return "▦";
  if (key.includes("analytics")) return "↗";
  if (key.includes("marketing")) return "✣";
  return "→";
}

export default function LocationEditorNav({ links, activeSectionId = "overview", onSectionSelect }: { links: Links; activeSectionId?: string; onSectionSelect?: (sectionId: typeof cleanEditorHashNav[number]["sectionId"]) => void }) {
  const actions = getCleanEditorActions(links);
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[280px] overflow-y-auto border-r border-white/10 bg-[#050607] px-4 py-5 shadow-2xl lg:block">
      <div className="mb-5 px-3">
        <img src="/toh_logo.png" alt="TheOutHaven" className="h-8 w-auto object-contain" />
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff9bb6]">Location Editor</p>
          <p className="mt-1 text-[11px] font-bold text-white/35">Enterprise profile workspace</p>
        </div>
      </div>

      <nav className="space-y-6" aria-label="Location editor navigation">
        <div>
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Manage</p>
          <div className="mt-2 grid gap-1">
            {cleanEditorHashNav.map((item) => {
              const active = item.sectionId === activeSectionId;
              return (
                <button key={item.href} type="button" onClick={() => onSectionSelect?.(item.sectionId)} className={`${navClass} ${active ? activeClass : ""}`}>
                  <span className="flex items-center gap-3"><span className="w-4 text-center text-[#ff9bb6]">{iconFor(item.label)}</span>{item.label}</span>
                  {active ? <span className="h-2 w-2 rounded-full bg-[#ff2142]" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Quick Actions</p>
          <div className="mt-2 grid gap-1">
            {actions.slice(0, 4).map((item) => (
              <a key={item.label} href={item.href} className={item.kind === "primary" ? `${navClass} border border-[#e1062a]/35 bg-[#e1062a]/15 text-white` : navClass}>
                <span>{item.label}</span><span className="text-white/25">↗</span>
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-sm font-black text-white">Need help?</p>
        <p className="mt-1 text-xs font-semibold text-white/45">Visit the Help Center</p>
      </div>
    </aside>
  );
}
