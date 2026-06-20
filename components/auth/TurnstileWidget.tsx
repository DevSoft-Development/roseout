"use client";
import { Turnstile } from "@marsidev/react-turnstile";
export function TurnstileWidget({onToken,onTokenChange}:{onToken?:(token:string)=>void;onTokenChange?:(token:string)=>void;turnstileRef?: any}){const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; if(!siteKey){return <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">Turnstile is not configured in this environment. Local development can continue; production signup will require it.</p>;} return <Turnstile siteKey={siteKey} onSuccess={(token)=>{onToken?.(token);onTokenChange?.(token)}} onError={()=>{onToken?.("");onTokenChange?.("")}} options={{theme:"dark",action:"signup"}}/>}

export default TurnstileWidget;
