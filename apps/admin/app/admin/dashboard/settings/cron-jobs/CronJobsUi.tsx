"use client";

import type { ReactNode } from "react";

export function AdminPageHeader({eyebrow,title,subtitle,actions}:{eyebrow?:string;title:string;subtitle?:string;actions?:ReactNode}) {
  return <section className="rounded-[1.25rem] border-b border-white/10 bg-transparent py-2">
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {eyebrow?<p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">{eyebrow}</p>:null}
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle?<p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">{subtitle}</p>:null}
      </div>
      {actions?<div className="flex min-w-0 flex-wrap gap-2">{actions}</div>:null}
    </div>
  </section>;
}
export function AdminKpiGrid({children}:{children:ReactNode}) {
  return <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</section>;
}
export function AdminKpiCard({label,value,helper}:{label:string;value:number|string;helper?:string}) {
  return <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">{label}</p>
    <p className="mt-3 truncate text-3xl font-black text-white">{typeof value==="number"?new Intl.NumberFormat("en-US").format(value):value}</p>
    {helper?<p className="mt-1 text-xs font-semibold text-white/45">{helper}</p>:null}
  </div>;
}
export function AdminSectionCard({children,className=""}:{children:ReactNode;className?:string}) {
  return <section className={`min-w-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#101012] shadow-xl shadow-black/20 ${className}`}>{children}</section>;
}
