import Link from "next/link";
const tabs=[["Overview","/admin/dashboard/knowledge-base"],["New article","/admin/dashboard/knowledge-base/new"],["Categories","/admin/dashboard/knowledge-base/categories"],["Templates","/admin/dashboard/knowledge-base/templates"],["AI helper","/admin/dashboard/knowledge-base/ai"]];
export default function KbTabs(){return <nav className="flex flex-wrap gap-2">{tabs.map(([label,href])=><Link key={href} href={href} className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-bold">{label}</Link>)}</nav>}
