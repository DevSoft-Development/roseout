"use client";
import { useEffect, useState } from "react";
export type ReserveTheme = "dark" | "light";
export function getInitialReserveTheme(): ReserveTheme { if (typeof window === 'undefined') return 'dark'; const stored=window.localStorage.getItem('theouthaven_reserve_theme'); if (stored==='dark'||stored==='light') return stored; return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
export default function ReserveThemeToggle({ theme, onChange }: { theme: ReserveTheme; onChange: (theme: ReserveTheme)=>void }) { const [ready,setReady]=useState(false); useEffect(()=>setReady(true),[]); return <button type="button" onClick={()=>onChange(theme==='dark'?'light':'dark')} className="reserve-soft rounded-full px-4 py-2 text-sm font-black" aria-label="Toggle reservation dashboard theme">{ready && theme==='light' ? 'Light' : 'Dark'} mode</button>; }
