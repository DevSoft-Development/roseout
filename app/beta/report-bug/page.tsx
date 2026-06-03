import { getCurrentBetaContext } from "@/lib/beta/isBetaTester";
import BetaBugForm from "./BetaBugForm";
export default async function Page(){const ctx=await getCurrentBetaContext().catch(()=>({isBetaTester:false,isAdmin:false} as any));return <main className="min-h-screen bg-[#090706] px-4 py-10 text-white"><div className="mx-auto max-w-4xl"><h1 className="text-4xl font-black">Report a beta bug</h1><p className="mt-3 text-white/65">Tell us what broke and how we can reproduce it.</p><div className="mt-8"><BetaBugForm requireTurnstile={!(ctx.isBetaTester||ctx.isAdmin)}/></div></div></main>}
