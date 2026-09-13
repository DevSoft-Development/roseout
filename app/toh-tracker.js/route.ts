import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const tracker = String.raw`(()=>{try{const s=document.currentScript;if(!s)return;const k=s.getAttribute('data-site-key');if(!k)return;const b=new URL(s.src).origin;const q=new URLSearchParams(location.search);const a=q.get('toh_attribution')||localStorage.getItem('toh_attribution');if(q.get('toh_attribution'))localStorage.setItem('toh_attribution',q.get('toh_attribution'));const sid=(()=>{let v=sessionStorage.getItem('toh_session');if(!v){v=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());sessionStorage.setItem('toh_session',v)}return v})();const send=(eventName,metadata={})=>{const body=JSON.stringify({site_key:k,event_name:eventName,attribution_token:a,page_url:location.href,referrer:document.referrer||null,session_id:sid,metadata});if(navigator.sendBeacon){navigator.sendBeacon(b+'/api/website-tracking/event',new Blob([body],{type:'application/json'}));return}fetch(b+'/api/website-tracking/event',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,mode:'cors'}).catch(()=>{})};const text=e=>((e.getAttribute&&[e.getAttribute('aria-label'),e.getAttribute('title')].filter(Boolean).join(' '))+' '+(e.textContent||'')).toLowerCase();const href=e=>{try{return new URL(e.href,location.href)}catch{return null}};const classify=e=>{const t=text(e);const u=href(e);const h=(u&&u.href.toLowerCase())||'';const host=(u&&u.hostname.toLowerCase())||'';if(/resy|opentable|sevenrooms|tock|toasttab|reserve|reservation|book/.test(t+' '+h+' '+host))return'external_reserve_click';if(/menu/.test(t+' '+h))return'external_menu_view';if(/^tel:/.test(h)||/call|phone/.test(t))return'external_call_click';if(/maps\.google|google\.com\/maps|directions|direction/.test(t+' '+h))return'external_directions_click';if(/order|delivery|pickup|doordash|ubereats|grubhub/.test(t+' '+h+' '+host))return'external_order_click';if(/contact/.test(t))return'external_contact_submit';if(/event|ticket/.test(t+' '+h))return'external_event_view';return null};send('external_site_session_started',{title:document.title});send('external_page_view',{title:document.title,path:location.pathname});document.addEventListener('click',e=>{const el=e.target&&e.target.closest?e.target.closest('a,button,[role="button"]'):null;if(!el)return;const n=classify(el);if(n)send(n,{label:text(el).slice(0,160),target_url:el.href||null})},true)}catch{}})();`;

export async function GET() {
  return new NextResponse(tracker, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
