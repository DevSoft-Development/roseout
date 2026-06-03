import { requireAdminRole } from "@/lib/admin-auth";
import type { AdminRole } from "@/lib/users/roles";
import SearchLabClient from "./SearchLabClient";
export const dynamic="force-dynamic";
export const metadata={title:"Beta Search Lab – Admin"};
const roles:AdminRole[]=["superadmin","admin","experience","experience_team"];
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){await requireAdminRole(roles); const sp=await searchParams; return <main className="min-h-screen bg-[#090706] px-4 py-8 text-white"><div className="mx-auto max-w-6xl space-y-5"><section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-4xl font-black">Beta Search Lab</h1><p className="mt-3 text-white/65">Run real beta prompts through enterprise search with parsed intent and timing diagnostics.</p></section><SearchLabClient initialQuery={sp.q||""}/></div></main>}
