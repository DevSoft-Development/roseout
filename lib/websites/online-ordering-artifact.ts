import "server-only";

import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

function e(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function websiteName(location: GeneratedWebsiteLocationSnapshot) {
  return String(location.name || location.title || "Order Online");
}

function orderPage(location: GeneratedWebsiteLocationSnapshot) {
  const locationId = e(location.id);
  const name = e(websiteName(location));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Online | ${name}</title>
<script src="https://js.stripe.com/v3/"></script>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f7f5f2}
*{box-sizing:border-box}body{margin:0}.order-shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:28px 0 80px}
.order-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:30px}.order-top a{color:inherit;text-decoration:none;font-weight:800}
.order-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:26px}.panel{background:white;border:1px solid #e4dfd8;border-radius:22px;padding:22px}
h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.95;margin:8px 0 12px;letter-spacing:-.04em}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:850;color:#a5362c}
.muted{color:#6f6a64;line-height:1.55}.item{display:grid;grid-template-columns:1fr auto;gap:16px;padding:18px 0;border-top:1px solid #eee9e3}.item:first-child{border-top:0}
.item h3{margin:0 0 5px}.price{font-weight:850}.sold{opacity:.52}.badge{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:850;color:#a5362c}
button{border:0;border-radius:999px;padding:12px 17px;font-weight:850;cursor:pointer}.primary{width:100%;background:#c82922;color:white}.secondary{background:#f0ece7;color:#171717}
button:disabled{cursor:not-allowed;opacity:.45}.cart-line{display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px 0;border-bottom:1px solid #eee9e3}
.total-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0}.grand{font-size:18px;font-weight:900;padding-top:12px;margin-top:8px;border-top:1px solid #ddd6ce}
label{display:block;font-size:12px;font-weight:800;margin:14px 0 6px}input,select{width:100%;padding:12px 13px;border:1px solid #d8d0c8;border-radius:12px;background:white;font:inherit}
.modifiers{margin:9px 0 4px;padding:10px;background:#faf8f5;border-radius:12px}.modifiers label{display:flex;gap:8px;align-items:center;margin:7px 0;font-weight:600}.modifiers input{width:auto}
#payment-wrap{display:none;margin-top:18px;padding-top:18px;border-top:1px solid #e7e1db}#message{margin-top:12px;font-weight:700}.success{color:#18744a}.error{color:#a32621}
@media(max-width:820px){.order-grid{grid-template-columns:1fr}.order-top{align-items:flex-start}.panel{padding:18px}}
</style>
</head>
<body>
<main class="order-shell">
  <div class="order-top"><a href="/">← ${name}</a><strong>Pickup ordering</strong></div>
  <div class="order-grid">
    <section class="panel">
      <div class="eyebrow">Order Online</div>
      <h1>Pickup from ${name}</h1>
      <p id="prep" class="muted">Loading today’s menu and availability…</p>
      <div id="menu"></div>
    </section>
    <aside class="panel">
      <h2>Your order</h2>
      <div id="cart"><p class="muted">Your cart is empty.</p></div>
      <div id="totals"></div>
      <label for="customer-name">Name</label><input id="customer-name" autocomplete="name" maxlength="160">
      <label for="customer-email">Email</label><input id="customer-email" type="email" autocomplete="email" maxlength="320">
      <label for="customer-phone">Mobile</label><input id="customer-phone" type="tel" autocomplete="tel" maxlength="80">
      <label for="pickup-at">Pickup time</label><input id="pickup-at" type="datetime-local">
      <label for="tip">Tip</label>
      <select id="tip"><option value="0">No tip</option><option value="15">15%</option><option value="18">18%</option><option value="20">20%</option><option value="25">25%</option></select>
      <button id="checkout" class="primary" type="button" disabled>Continue to payment</button>
      <div id="payment-wrap">
        <div id="payment-element"></div>
        <button id="pay" class="primary" type="button" style="margin-top:16px">Place paid order</button>
      </div>
      <div id="message" aria-live="polite"></div>
    </aside>
  </div>
</main>
<script>
(() => {
const LOCATION_ID=${JSON.stringify(location.id)};
const API="https://theouthaven.com/api/public/online-ordering/"+encodeURIComponent(LOCATION_ID);
let catalog=null, cart=[], stripe=null, elements=null, activeOrder=null;
const money=(c)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format((Number(c)||0)/100);
const esc=(v)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const idempotency=()=>crypto.randomUUID?crypto.randomUUID():"web-"+Date.now()+"-"+Math.random().toString(16).slice(2);
function selectedMods(itemId){return [...document.querySelectorAll('[data-mod-item="'+CSS.escape(itemId)+'"]:checked')].map(x=>x.value)}
function renderMenu(){
 const root=document.getElementById("menu");
 root.innerHTML=(catalog.items||[]).map(item=>{
   const groups=(item.modifiers||[]).map(g=>'<div class="modifiers"><strong>'+esc(g.name)+(g.required?' *':'')+'</strong>'+
     (g.modifiers||[]).map(m=>'<label><input data-mod-item="'+esc(item.id)+'" type="'+(g.maxSelect===1?'radio':'checkbox')+'" name="mod-'+esc(g.id)+'" value="'+esc(m.id)+'" '+(item.soldOut?'disabled':'')+'>'+esc(m.name)+(m.priceDeltaCents?' + '+money(m.priceDeltaCents):'')+'</label>').join("")+'</div>').join("");
   return '<article class="item '+(item.soldOut?'sold':'')+'"><div><h3>'+esc(item.name)+'</h3>'+(item.description?'<p class="muted">'+esc(item.description)+'</p>':'')+
     (item.lowStock&&!item.soldOut?'<div class="badge">Low stock</div>':'')+(item.soldOut?'<div class="badge">Sold out</div>':'')+groups+'</div><div><div class="price">'+money(item.priceCents)+'</div><button class="secondary add" data-id="'+esc(item.id)+'" '+(item.soldOut?'disabled':'')+'>Add</button></div></article>';
 }).join("")||'<p class="muted">Online ordering is not available right now.</p>';
 root.querySelectorAll(".add").forEach(btn=>btn.addEventListener("click",()=>add(btn.dataset.id)));
}
function add(id){
 const item=catalog.items.find(x=>x.id===id); if(!item||item.soldOut)return;
 const modifierIds=selectedMods(id);
 for(const g of item.modifiers||[]){
   const count=modifierIds.filter(mid=>(g.modifiers||[]).some(m=>m.id===mid)).length;
   if(count<g.minSelect||g.maxSelect!==null&&count>g.maxSelect){setMessage("Choose the required options for "+item.name,true);return;}
 }
 const key=id+"|"+modifierIds.sort().join(",");
 const existing=cart.find(x=>x.key===key);
 if(existing)existing.quantity+=1; else cart.push({key,catalogItemId:id,quantity:1,modifierIds});
 renderCart(); setMessage("",false);
}
function renderCart(){
 const root=document.getElementById("cart");
 if(!cart.length) root.innerHTML='<p class="muted">Your cart is empty.</p>';
 else root.innerHTML=cart.map((line,i)=>{const item=catalog.items.find(x=>x.id===line.catalogItemId);return '<div class="cart-line"><div><strong>'+esc(item?.name||"Item")+'</strong><div class="muted">Qty '+line.quantity+'</div></div><button class="secondary remove" data-i="'+i+'">Remove</button></div>'}).join("");
 root.querySelectorAll(".remove").forEach(b=>b.addEventListener("click",()=>{cart.splice(Number(b.dataset.i),1);renderCart()}));
 document.getElementById("checkout").disabled=!cart.length||!catalog?.acceptingOrders;
 const subtotal=cart.reduce((sum,line)=>{const item=catalog.items.find(x=>x.id===line.catalogItemId);const mods=(item?.modifiers||[]).flatMap(g=>g.modifiers||[]);const mod=line.modifierIds.reduce((s,id)=>s+(mods.find(m=>m.id===id)?.priceDeltaCents||0),0);return sum+line.quantity*((item?.priceCents||0)+mod)},0);
 document.getElementById("totals").innerHTML=cart.length?'<div class="total-row grand"><span>Menu subtotal</span><span>'+money(subtotal)+'</span></div><p class="muted">Tax, service charges and tip are calculated securely at checkout.</p>':'';
}
function setMessage(v,err){const el=document.getElementById("message");el.textContent=v;el.className=err?"error":v?"success":""}
async function load(){
 try{
  const r=await fetch(API+"/catalog",{cache:"no-store"});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Unable to load ordering.");
  catalog=j.catalog; document.getElementById("prep").textContent=catalog.acceptingOrders?"Pickup is usually ready in about "+catalog.defaultPrepMinutes+" minutes.":"Online ordering is temporarily paused.";
  renderMenu();renderCart();
 }catch(e){setMessage(e.message||"Unable to load ordering.",true)}
}
async function beginCheckout(){
 const name=document.getElementById("customer-name").value.trim(); if(!name){setMessage("Enter your name.",true);return}
 const subtotal=cart.reduce((sum,line)=>{const item=catalog.items.find(x=>x.id===line.catalogItemId);const mods=(item?.modifiers||[]).flatMap(g=>g.modifiers||[]);const mod=line.modifierIds.reduce((s,id)=>s+(mods.find(m=>m.id===id)?.priceDeltaCents||0),0);return sum+line.quantity*((item?.priceCents||0)+mod)},0);
 const tipPct=Number(document.getElementById("tip").value||0);const tipCents=Math.round(subtotal*tipPct/100);
 const body={idempotencyKey:idempotency(),customer:{name,email:document.getElementById("customer-email").value.trim(),phone:document.getElementById("customer-phone").value.trim()},requestedPickupAt:document.getElementById("pickup-at").value?new Date(document.getElementById("pickup-at").value).toISOString():null,tipCents,lines:cart.map(x=>({catalogItemId:x.catalogItemId,quantity:x.quantity,modifierIds:x.modifierIds}))};
 document.getElementById("checkout").disabled=true;setMessage("Preparing secure payment…",false);
 try{
  const r=await fetch(API+"/orders",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":body.idempotencyKey},body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Unable to start checkout.");
  activeOrder=j.order;stripe=Stripe(activeOrder.publishableKey,{stripeAccount:activeOrder.connectedAccountId});elements=stripe.elements({clientSecret:activeOrder.clientSecret});elements.create("payment").mount("#payment-element");
  document.getElementById("payment-wrap").style.display="block";document.getElementById("checkout").style.display="none";setMessage("",false);
 }catch(e){document.getElementById("checkout").disabled=false;setMessage((e.message||"Checkout failed.").replaceAll("_"," "),true);await load()}
}
async function pay(){
 if(!stripe||!elements||!activeOrder)return;document.getElementById("pay").disabled=true;setMessage("Processing payment…",false);
 const result=await stripe.confirmPayment({elements,redirect:"if_required",confirmParams:{return_url:location.href}});
 if(result.error){document.getElementById("pay").disabled=false;setMessage(result.error.message||"Payment failed.",true);return}
 try{
   const r=await fetch(API+"/orders/"+encodeURIComponent(activeOrder.onlineOrderId)+"/finalize",{method:"POST"});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Payment received; order confirmation is still syncing.");
   const when=new Date(activeOrder.promisedPickupAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
   document.querySelector(".order-grid").innerHTML='<section class="panel" style="grid-column:1/-1"><div class="eyebrow">Order received</div><h1>We’ve got it.</h1><p class="muted">Your pickup is expected around <strong>'+esc(when)+'</strong>. Keep this page for your confirmation.</p><a href="/" style="font-weight:850;color:#a5362c">Back to '+esc(${JSON.stringify(websiteName(location))})+'</a></section>';
 }catch(e){setMessage(e.message||"Payment received. Confirmation is syncing.",false)}
}
document.getElementById("checkout").addEventListener("click",beginCheckout);document.getElementById("pay").addEventListener("click",pay);load();
})();
</script>
</body></html>`;
}

export function addGeneratedOnlineOrderingArtifact(
  files: WebsiteArtifactFile[],
  location: GeneratedWebsiteLocationSnapshot,
): WebsiteArtifactFile[] {
  if (!location.online_ordering_enabled || !location.id) return files;
  const cta = '<a class="toh-order-cta" href="/order/">Order Online</a>';
  const styled = files.map((file) => {
    if (file.path !== "index.html" || !file.content) return file;
    let content = file.content.replace("</header>", `${cta}</header>`);
    content = content.replace(
      "</style>",
      ".toh-order-cta{display:inline-flex;align-items:center;justify-content:center;background:#c82922;color:#fff!important;padding:11px 16px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-left:12px}</style>",
    );
    return { ...file, content };
  });
  return styled.concat({
    path: "order/index.html",
    content: orderPage(location),
    contentType: "text/html; charset=utf-8",
    encoding: "utf8",
  });
}
