import "server-only";

import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function orderPage(location: GeneratedWebsiteLocationSnapshot) {
  const locationId = escapeHtml(location.id);
  const locationName = escapeHtml(location.name || location.title || "Order Online");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Online — ${locationName}</title>
<meta name="description" content="Order pickup directly from ${locationName}.">
<script src="https://js.stripe.com/v3/"></script>
<style>
:root{color-scheme:light dark;--bg:#0d0d0f;--panel:#17171a;--text:#f8f8fa;--muted:#a6a6ad;--border:#303036;--accent:#ff2142;--ok:#76d09a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}
main{width:min(1120px,calc(100% - 28px));margin:auto;padding:28px 0 80px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}.back{text-decoration:none;font-weight:800}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);font-weight:900}h1{font-size:clamp(2rem,6vw,4rem);line-height:1;margin:.25rem 0 .5rem}.sub{color:var(--muted);margin:0}.layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,.8fr);gap:24px;align-items:start}.panel{border:1px solid var(--border);background:var(--panel);border-radius:22px;padding:20px}.items{display:grid;gap:12px}.item{border:1px solid var(--border);border-radius:18px;padding:16px}.item-head{display:flex;justify-content:space-between;gap:16px}.item h3{margin:0 0 4px}.muted{color:var(--muted);font-size:14px}.price{font-weight:900;white-space:nowrap}.mods{display:grid;gap:8px;margin-top:12px}.mod-group{border-top:1px solid var(--border);padding-top:10px}.mod-group strong{font-size:13px}.mod-option{display:flex;align-items:center;gap:8px;margin-top:7px;font-size:14px}.actions{display:flex;gap:10px;align-items:center;margin-top:14px}.qty{width:72px;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:inherit}.btn{border:0;border-radius:999px;padding:12px 18px;font-weight:900;cursor:pointer}.btn.primary{background:var(--accent);color:white}.btn.secondary{background:transparent;color:inherit;border:1px solid var(--border)}.btn:disabled{opacity:.45;cursor:not-allowed}.cart-line{padding:12px 0;border-bottom:1px solid var(--border)}.cart-line:last-child{border-bottom:0}.cart-line-head{display:flex;justify-content:space-between;gap:12px}.totals{display:grid;gap:7px;margin-top:16px}.total-row{display:flex;justify-content:space-between}.total-row.grand{font-size:20px;font-weight:900;border-top:1px solid var(--border);padding-top:12px;margin-top:5px}.field{display:grid;gap:6px;margin-top:12px}.field label{font-size:13px;font-weight:800}.field input{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:transparent;color:inherit;font:inherit}.status{margin:12px 0;padding:12px;border-radius:12px;background:#ffffff0a;color:var(--muted)}#card-wrap{display:none;margin-top:14px}.card-shell{padding:14px;border:1px solid var(--border);border-radius:12px;background:white}.success{border-color:var(--ok);color:var(--ok)}.sold{opacity:.6}.sticky{position:sticky;top:18px}
@media(max-width:820px){.layout{grid-template-columns:1fr}.sticky{position:static}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<main>
<div class="top"><div><div class="eyebrow">Pickup ordering</div><h1>${locationName}</h1><p class="sub">Order directly from this location for pickup.</p></div><a class="back" href="/">← Back to website</a></div>
<div class="layout">
<section class="panel"><div id="catalog-status" class="status">Loading menu…</div><div id="items" class="items"></div></section>
<aside class="panel sticky">
<h2 style="margin-top:0">Your order</h2>
<div id="cart"><p class="muted">Your cart is empty.</p></div>
<div class="field"><label for="name">Name</label><input id="name" autocomplete="name"></div>
<div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email"></div>
<div class="field"><label for="phone">Phone</label><input id="phone" autocomplete="tel"></div>
<div class="field"><label for="pickup">Pickup time</label><input id="pickup" type="datetime-local"></div>
<div class="field"><label for="tip">Tip ($)</label><input id="tip" type="number" min="0" step="0.01" value="0"></div>
<div id="card-wrap"><div class="field"><label>Card</label><div class="card-shell"><div id="card-element"></div></div></div></div>
<div id="checkout-status" class="status">Add an item to begin.</div>
<button id="checkout" class="btn primary" style="width:100%" disabled>Continue to payment</button>
</aside>
</div>
</main>
<script>
(function(){
  const locationId=${JSON.stringify(location.id)};
  const api="https://www.theouthaven.com/api/widgets/orders?locationId="+encodeURIComponent(locationId);
  const state={catalog:null,cart:[],pending:null,stripe:null,elements:null,card:null};
  const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format((Number(cents)||0)/100);
  const el=id=>document.getElementById(id);
  const safe=value=>String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  function cartSubtotal(){return state.cart.reduce((sum,line)=>sum+line.quantity*(line.priceCents+line.modifierTotal),0)}
  function renderCart(){
    const cart=el("cart"), checkout=el("checkout");
    if(!state.cart.length){cart.innerHTML='<p class="muted">Your cart is empty.</p>';checkout.disabled=true;return}
    cart.innerHTML=state.cart.map((line,index)=>'<div class="cart-line"><div class="cart-line-head"><div><strong>'+safe(line.name)+'</strong><div class="muted">'+line.quantity+' × '+money(line.priceCents+line.modifierTotal)+'</div></div><button class="btn secondary remove" data-index="'+index+'" type="button">Remove</button></div></div>').join("")+'<div class="totals"><div class="total-row"><span>Subtotal</span><strong>'+money(cartSubtotal())+'</strong></div><div class="total-row grand"><span>Estimated total</span><span>'+money(cartSubtotal())+'</span></div></div>';
    cart.querySelectorAll(".remove").forEach(button=>button.addEventListener("click",()=>{state.cart.splice(Number(button.dataset.index),1);renderCart()}));
    checkout.disabled=false;
    el("checkout-status").textContent="Taxes and any configured service charge are calculated securely at checkout.";
  }
  function selectedModifiers(itemId){
    const item=state.catalog.items.find(i=>i.id===itemId);const ids=[];
    for(const group of item.modifiers||[]){
      document.querySelectorAll('[data-group="'+group.id+'"]:checked').forEach(input=>ids.push(input.value));
    }
    return ids;
  }
  function renderCatalog(){
    const box=el("items"), status=el("catalog-status");
    if(!state.catalog.acceptingOrders){status.textContent="Online ordering is temporarily paused.";box.innerHTML="";return}
    status.textContent="Pickup is available. Current prep estimate: about "+state.catalog.defaultPrepMinutes+" minutes.";
    box.innerHTML=state.catalog.items.map(item=>{
      const groups=(item.modifiers||[]).map(group=>{
        const type=group.maxSelect===1?"radio":"checkbox";
        return '<div class="mod-group"><strong>'+safe(group.name)+(group.required?' · Required':'')+'</strong>'+group.modifiers.map(mod=>'<label class="mod-option"><input data-group="'+group.id+'" type="'+type+'" name="'+group.id+'" value="'+mod.id+'"> <span>'+safe(mod.name)+(mod.priceDeltaCents?' +'+money(mod.priceDeltaCents):'')+'</span></label>').join("")+'</div>';
      }).join("");
      return '<article class="item '+(item.soldOut?'sold':'')+'"><div class="item-head"><div><h3>'+safe(item.name)+'</h3><div class="muted">'+safe(item.description||"")+'</div></div><div class="price">'+money(item.priceCents)+'</div></div>'+groups+'<div class="actions"><input class="qty" id="qty-'+item.id+'" type="number" min="1" max="99" value="1"><button class="btn primary add" type="button" data-id="'+item.id+'" '+(item.soldOut?'disabled':'')+'>'+(item.soldOut?'Sold out':'Add')+'</button></div></article>';
    }).join("");
    box.querySelectorAll(".add").forEach(button=>button.addEventListener("click",()=>{
      const item=state.catalog.items.find(i=>i.id===button.dataset.id);
      const quantity=Math.max(1,Math.min(99,Number(el("qty-"+item.id).value)||1));
      const modifierIds=selectedModifiers(item.id);
      for(const group of item.modifiers||[]){
        const count=modifierIds.filter(id=>group.modifiers.some(mod=>mod.id===id)).length;
        if(count<group.minSelect||(group.maxSelect!=null&&count>group.maxSelect)){alert("Please complete the "+group.name+" options.");return}
      }
      const selected=(item.modifiers||[]).flatMap(group=>group.modifiers).filter(mod=>modifierIds.includes(mod.id));
      state.cart.push({catalogItemId:item.id,name:item.name,quantity,modifierIds,priceCents:item.priceCents,modifierTotal:selected.reduce((s,m)=>s+m.priceDeltaCents,0)});
      renderCart();
    }));
  }
  async function loadCatalog(){
    try{const response=await fetch(api+"&action=catalog",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Menu unavailable");state.catalog=data;renderCatalog()}
    catch(error){el("catalog-status").textContent=error.message||"Online ordering is unavailable."}
  }
  async function beginCheckout(){
    const button=el("checkout"), status=el("checkout-status");
    if(state.pending){return confirmPayment()}
    const name=el("name").value.trim();if(!name){status.textContent="Please enter your name.";return}
    button.disabled=true;status.textContent="Preparing secure checkout…";
    const idempotencyKey=(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(16).slice(2));
    try{
      const response=await fetch(api+"&action=create",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({
        customer:{name,email:el("email").value.trim(),phone:el("phone").value.trim()},
        requestedPickupAt:el("pickup").value?new Date(el("pickup").value).toISOString():null,
        tipCents:Math.max(0,Math.round((Number(el("tip").value)||0)*100)),
        lines:state.cart.map(line=>({catalogItemId:line.catalogItemId,quantity:line.quantity,modifierIds:line.modifierIds}))
      })});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Checkout could not start.");
      state.pending=data;
      state.stripe=Stripe(data.publishableKey,{stripeAccount:data.connectedAccountId});
      state.elements=state.stripe.elements();
      state.card=state.elements.create("card");
      state.card.mount("#card-element");
      el("card-wrap").style.display="block";
      button.textContent="Pay "+money(data.amounts.totalCents);
      status.textContent="Enter your card information, then complete payment.";
    }catch(error){status.textContent=error.message||"Checkout could not start."}
    finally{button.disabled=false}
  }
  async function confirmPayment(){
    const button=el("checkout"),status=el("checkout-status");button.disabled=true;status.textContent="Processing payment…";
    try{
      const result=await state.stripe.confirmCardPayment(state.pending.clientSecret,{payment_method:{card:state.card,billing_details:{name:el("name").value.trim(),email:el("email").value.trim()||undefined,phone:el("phone").value.trim()||undefined}}});
      if(result.error)throw new Error(result.error.message||"Payment was not completed.");
      const response=await fetch(api+"&action=finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({onlineOrderId:state.pending.onlineOrderId})});
      const data=await response.json();if(!response.ok||!data.finalized)throw new Error(data.error||"Payment is processing. Please check your order status shortly.");
      const pickup=new Date(state.pending.promisedPickupAt).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"});
      status.classList.add("success");status.textContent="Order received! Estimated pickup: "+pickup+".";
      button.style.display="none";el("card-wrap").style.display="none";state.cart=[];renderCart();
      pollStatus(state.pending.onlineOrderId);
    }catch(error){status.textContent=error.message||"Payment could not be completed.";button.disabled=false}
  }
  async function pollStatus(orderId){
    let count=0;const timer=setInterval(async()=>{count++;if(count>120){clearInterval(timer);return}try{const r=await fetch(api+"&action=status&onlineOrderId="+encodeURIComponent(orderId),{cache:"no-store"});const d=await r.json();if(r.ok&&d.order){el("checkout-status").textContent="Order status: "+String(d.order.status).replaceAll("_"," ")+(d.order.promised_pickup_at?" · Pickup "+new Date(d.order.promised_pickup_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"");if(["completed","canceled"].includes(d.order.status))clearInterval(timer)}}catch{}},10000);
  }
  el("checkout").addEventListener("click",beginCheckout);
  loadCatalog();
})();
</script>
</body></html>`;
}

function injectOrderLink(html: string) {
  const link = '<a class="toh-order-online" href="/order/">Order Online</a>';
  if (html.includes('href="/order/"')) return html;
  let next = html;
  if (next.includes("</header>")) next = next.replace("</header>", `${link}</header>`);
  else if (next.includes("<body")) next = next.replace(/(<body[^>]*>)/i, `$1${link}`);
  if (next.includes("</style>")) {
    next = next.replace("</style>", '.toh-order-online{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:900;border-radius:999px;padding:10px 16px;background:var(--accent,#ff2142);color:var(--accentText,#fff);margin:8px}.toh-order-online:focus-visible{outline:3px solid currentColor;outline-offset:3px}</style>');
  }
  return next;
}

export function addGeneratedWebsiteOnlineOrdering(
  files: WebsiteArtifactFile[],
  location: GeneratedWebsiteLocationSnapshot,
): WebsiteArtifactFile[] {
  if (!location.online_ordering_enabled) return files;
  const updated = files.map((file) =>
    file.content && file.path.endsWith(".html")
      ? { ...file, content: injectOrderLink(file.content) }
      : file,
  );
  if (updated.some((file) => file.path === "order/index.html")) return updated;
  return updated.concat({
    path: "order/index.html",
    content: orderPage(location),
    contentType: "text/html; charset=utf-8",
    encoding: "utf8",
  });
}
