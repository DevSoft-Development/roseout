"use client";
import { ReactNode, useEffect, useState } from "react";
import ReserveThemeToggle, { getInitialReserveTheme, type ReserveTheme } from "./ReserveThemeToggle";
import ReserveSidebar from "./ReserveSidebar";
import ReserveTopBar from "./ReserveTopBar";
export default function ReserveCommandCenterShell(props:{children:ReactNode; locationName?:string; locationId?:string; locationType?:string; activeTab:string; onTabChange:(tab:string)=>void; actions?:ReactNode; setupEnabled?:boolean; userLabel?:string}){ const [theme,setTheme]=useState<ReserveTheme>('dark'); useEffect(()=>setTheme(getInitialReserveTheme()),[]); function change(next:ReserveTheme){ setTheme(next); localStorage.setItem('theouthaven_reserve_theme', next); } return <main className={`reserve-command-center reserve-theme-${theme} min-h-screen`}><div className="grid min-h-screen lg:grid-cols-[290px_1fr]"><ReserveSidebar {...props}/><section className="min-w-0 p-3 sm:p-5 lg:p-6"><ReserveTopBar {...props} themeToggle={<ReserveThemeToggle theme={theme} onChange={change}/>} />{props.children}</section></div></main> }
