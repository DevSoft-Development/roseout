"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Read-only refresh: does not dispatch imports or modify budget configuration.
export default function LiveRefresh() {
  const router=useRouter();
  useEffect(()=>{
    const id=window.setInterval(()=>{ if(document.visibilityState==="visible") router.refresh(); },15000);
    return ()=>window.clearInterval(id);
  },[router]);
  return <span className="text-xs text-white/50">Progress refreshes every 15 seconds while this page is visible.</span>;
}
