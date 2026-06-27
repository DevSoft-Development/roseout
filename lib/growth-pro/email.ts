import { sendTemplatedEmail } from "@/lib/email/send";
export async function sendGrowthProEmail(to:string|undefined|null, templateKey:string, input:Record<string,any>={}){ if(!to) return null; try{return await sendTemplatedEmail({to,templateKey,input,sourceType:"growth_pro"});}catch(e){console.warn("Growth Pro email skipped",e); return null;} }
