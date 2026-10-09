import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";
import { getPosPlanForLocation } from "@/lib/pos/access";
import { getSignaturePlusInventory, getSignaturePlusReport } from "@/lib/pos/signature-plus/service";
import { getPosManagerOperations } from "@/lib/pos/payments/manager-service";
import { createPosInventoryArea, recordPosInventoryWaste, transferPosInventoryStock } from "./actions";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";

export const dynamic="force-dynamic";

type SearchParams=Record<string,string|string[]|undefined>;
function first(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function money(cents:number){return "$"+(Number(cents||0)/100).toFixed(2);}
function qty(value:number){return Number(value||0).toLocaleString(undefined,{maximumFractionDigits:4});}
function title(value:string){return String(value||"").replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());}
function dateValue(value:string|undefined){return value&&/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):"";}

export default async function PosOperationsPage({searchParams}:{searchParams?:Promise<SearchParams>}){
  const params=(await searchParams)||{};
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const cookieStore=await cookies();
  const adminLocationId=first(params.adminLocationId);
  const demoLocationId=first(params.demoLocationId);
  const sourceId=first(params.sourceId);
  const type=first(params.type);
  const demo=first(params.demo)==="1";
  const fromDemoCenter=first(params.fromDemoCenter)==="1";
  let locationId=
    first(params.locationId)||
    adminLocationId||
    demoLocationId||
    cookieStore.get("theouthaven_impersonate_location_id")?.value||
    "";

  if(!locationId&&user){
    const owner=await getLocationOwnerAccess(user.id,user.email??null);
    locationId=owner.ownedLocationIds[0]||owner.ownedSourceLocationIds[0]||"";
  }
  if(!locationId) redirect("/locations/dashboard");

  const access = user
    ? await resolveEditableLocationContext({
        userId: user.id,
        userEmail: user.email ?? null,
        locationId,
        adminLocationId,
        demoLocationId,
        sourceId,
        type,
        demo,
        fromDemoCenter,
      })
    : null;
  const internalDemoAccess=access?null:await getInternalDemoLocationAccess({
    locationId,adminLocationId,demoLocationId,demo,fromDemoCenter,
  });
  if(!access&&!internalDemoAccess) redirect(user?"/locations/dashboard":"/business/login?next=/locations/dashboard/pos/operations");

  const canonicalLocationId=String(access?.canonicalLocationId||internalDemoAccess!.locationId);
  const plan=await getPosPlanForLocation(canonicalLocationId);
  if(plan!=="signature_plus"&&!internalDemoAccess) redirect(`/locations/dashboard/pos?locationId=${encodeURIComponent(canonicalLocationId)}&signatureRequired=1`);

  const from=first(params.from)||null;
  const to=first(params.to)||null;
  const emptyInventory={
    stockAreas:[],ingredients:[],balances:[],recentWaste:[],recentTransfers:[],
    summary:{ingredientCount:0,lowStockCount:0,reorderCount:0,wasteEvents:0,transferEvents:0},
  };
  const emptyReport={
    metrics:{netSalesCents:0,checks:0,averageCheckCents:0,splitTenderCount:0,grossSalesCents:0,discountsCents:0,refundsCents:0,taxCents:0,tipsCents:0},
    inventoryMetrics:{wasteQuantity:0,transferQuantity:0,recipeUsageQuantity:0,wasteEvents:0,transferEvents:0},
    paymentMethods:[],courseMix:[],serverPerformance:[],topItems:[],
  };
  const emptyManagerOps={drawers:[],events:[],checks:[],tenders:[],items:[],staff:[],managers:[]};
  const [inventory,report,managerOps]=internalDemoAccess
    ? await Promise.all([
        getSignaturePlusInventory(canonicalLocationId).catch(()=>emptyInventory as any),
        getSignaturePlusReport({locationId:canonicalLocationId,from,to}).catch(()=>emptyReport as any),
        getPosManagerOperations(canonicalLocationId).catch(()=>emptyManagerOps as any),
      ])
    : await Promise.all([
        getSignaturePlusInventory(canonicalLocationId),
        getSignaturePlusReport({locationId:canonicalLocationId,from,to}),
        getPosManagerOperations(canonicalLocationId),
      ]);

  const location=access?.location||internalDemoAccess!.location||{};
  const locationName=String(location.name||location.location_name||location.restaurant_name||location.activity_name||"Your location");
  const stockAreas=inventory.stockAreas||[];
  const ingredients=inventory.ingredients||[];
  const reorderQueue=ingredients.filter((item:any)=>item.reorderNeeded);
  const q=new URLSearchParams({locationId:canonicalLocationId});
  const backHref=`/locations/dashboard/pos?${q.toString()}`;

  return <BusinessPageShell>
    <BusinessPageHeader
      eyebrow="ThePOSHaven · Signature+"
      title={`Inventory + shift operations for ${locationName}`}
      subtitle="Run ingredient inventory, stock-area transfers, payment oversight, drawer reconciliation, manager audit, and end-of-shift reporting from one operating screen."
      badge={<><BusinessStatusBadge tone="blue">Signature+</BusinessStatusBadge><BusinessStatusBadge tone="green">Live shard v10</BusinessStatusBadge></>}
      actions={<Link href={backHref} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--business-border)] px-4 text-sm font-black text-[var(--business-text)]">Back to POS</Link>}
    />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Ingredients",inventory.summary?.ingredientCount||0],
        ["Low stock",inventory.summary?.lowStockCount||0],
        ["Reorder now",inventory.summary?.reorderCount||0],
        ["Waste events",inventory.summary?.wasteEvents||0],
        ["Transfers",inventory.summary?.transferEvents||0],
      ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{label}</p>
        <p className="mt-2 text-3xl font-black text-[var(--business-text)]">{value}</p>
      </div>)}
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Ingredient inventory</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">On hand, reorder, and waste</h2>
          </div>
          <p className="text-xs font-bold text-[var(--business-muted)]">Fractional quantities supported to 4 decimals.</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead><tr className="border-b border-[var(--business-border)] text-[10px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">
              <th className="py-3 pr-4">Ingredient</th><th className="py-3 pr-4">On hand</th><th className="py-3 pr-4">Reorder</th><th className="py-3 pr-4">Vendor</th><th className="py-3">Log waste</th>
            </tr></thead>
            <tbody>{ingredients.map((item:any)=><tr key={item.id} className="border-b border-white/5 align-top">
              <td className="py-4 pr-4"><p className="font-black text-[var(--business-text)]">{item.name}</p><p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{item.vendorSku||"No vendor SKU"}</p></td>
              <td className="py-4 pr-4"><p className="font-black text-[var(--business-text)]">{qty(item.quantityOnHand)} {item.unit}</p><p className={`mt-1 text-xs font-bold ${item.lowStock?"text-amber-300":"text-emerald-300"}`}>{item.soldOut?"Sold out":item.lowStock?"Low stock":"Healthy"}</p></td>
              <td className="py-4 pr-4"><p className={`font-black ${item.reorderNeeded?"text-amber-300":"text-[var(--business-text)]"}`}>{item.reorderPoint==null?"—":qty(item.reorderPoint)+" "+item.unit}</p><p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{item.reorderQuantity==null?"No reorder qty":"Order "+qty(item.reorderQuantity)+" "+item.unit}</p></td>
              <td className="py-4 pr-4"><p className="font-bold text-[var(--business-text)]">{item.preferredVendor||"Not set"}</p></td>
              <td className="py-4">
                <form action={recordPosInventoryWaste} className="flex min-w-[270px] gap-2">
                  <input type="hidden" name="locationId" value={canonicalLocationId}/>
                  <input type="hidden" name="catalogItemId" value={item.id}/>
                  <input name="quantity" type="number" step="0.0001" min="0.0001" required placeholder="Qty" className="w-20 rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]"/>
                  <input name="reason" defaultValue="waste" aria-label={`Waste reason for ${item.name}`} className="min-w-0 flex-1 rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]"/>
                  <button className="rounded-xl bg-[#e1062a] px-3 py-2 text-xs font-black text-white">Log</button>
                </form>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {!ingredients.length&&<p className="mt-6 text-sm font-semibold text-[var(--business-muted)]">No catalog items are marked as ingredients yet.</p>}
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Stock areas</p>
          <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Walk-in, line, bar, storage</h2>
          <div className="mt-4 space-y-2">{stockAreas.map((area:any)=><div key={area.id} className="rounded-xl border border-white/7 bg-black/10 px-3 py-3">
            <p className="font-black text-[var(--business-text)]">{area.name}</p><p className="text-xs font-semibold text-[var(--business-muted)]">{area.code}</p>
          </div>)}</div>
          <form action={createPosInventoryArea} className="mt-4 grid gap-2">
            <input type="hidden" name="locationId" value={canonicalLocationId}/>
            <input name="name" required placeholder="New area name" className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]"/>
            <input name="code" placeholder="Optional code" className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]"/>
            <button className="rounded-xl border border-[#ff2142]/30 bg-[#e1062a]/10 px-3 py-2 text-sm font-black text-[#ff8da0]">Add stock area</button>
          </form>
        </div>

        <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Transfer stock</p>
          <form action={transferPosInventoryStock} className="mt-4 grid gap-2">
            <input type="hidden" name="locationId" value={canonicalLocationId}/>
            <select name="catalogItemId" required className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]">
              <option value="">Ingredient</option>{ingredients.map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select name="fromStockAreaId" required className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]">
                <option value="">From</option>{stockAreas.map((area:any)=><option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
              <select name="toStockAreaId" required className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]">
                <option value="">To</option>{stockAreas.map((area:any)=><option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </div>
            <input name="quantity" type="number" step="0.0001" min="0.0001" required placeholder="Quantity" className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold text-[var(--business-text)]"/>
            <button disabled={stockAreas.length<2||!ingredients.length} className="rounded-xl bg-[#e1062a] px-3 py-2 text-sm font-black text-white disabled:opacity-40">Transfer</button>
          </form>
        </div>
      </div>
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Area balances</p>
        <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Where inventory is sitting</h2>
        <div className="mt-4 space-y-2">{(inventory.balances||[]).map((row:any)=><div key={`${row.inventoryItemId}:${row.stockAreaId}`} className="flex items-center justify-between rounded-xl border border-white/7 bg-black/10 px-3 py-3">
          <div><p className="font-black text-[var(--business-text)]">{row.ingredientName}</p><p className="text-xs font-semibold text-[var(--business-muted)]">{row.stockAreaName}</p></div>
          <p className="font-black text-[var(--business-text)]">{qty(row.quantity)}</p>
        </div>)}</div>
        {!(inventory.balances||[]).length&&<p className="mt-4 text-sm font-semibold text-[var(--business-muted)]">No stock-area balances yet.</p>}
      </div>

      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Reorder queue</p>
        <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Ingredients at or below reorder point</h2>
        <div className="mt-4 space-y-2">{reorderQueue.map((item:any)=><div key={item.id} className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-3">
          <div className="flex items-center justify-between gap-3"><p className="font-black text-[var(--business-text)]">{item.name}</p><p className="font-black text-amber-300">{qty(item.quantityOnHand)} {item.unit}</p></div>
          <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{item.preferredVendor||"Vendor not set"}{item.reorderQuantity!=null?` · Order ${qty(item.reorderQuantity)} ${item.unit}`:""}</p>
        </div>)}</div>
        {!reorderQueue.length&&<p className="mt-4 text-sm font-semibold text-emerald-300">No ingredients currently need reorder.</p>}
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">End-of-shift report</p><h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">Sales → payments → inventory movement</h2></div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="locationId" value={canonicalLocationId}/>
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">From<input name="from" type="date" defaultValue={dateValue(from||undefined)} className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold normal-case tracking-normal text-[var(--business-text)]"/></label>
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">To<input name="to" type="date" defaultValue={dateValue(to||undefined)} className="rounded-xl border border-[var(--business-border)] bg-black/15 px-3 py-2 text-sm font-bold normal-case tracking-normal text-[var(--business-text)]"/></label>
          <button className="rounded-xl border border-[var(--business-border)] px-4 py-2 text-sm font-black text-[var(--business-text)]">Apply</button>
        </form>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Net sales",money(report.metrics.netSalesCents)],
          ["Checks",report.metrics.checks],
          ["Avg check",money(report.metrics.averageCheckCents)],
          ["Split tenders",report.metrics.splitTenderCount],
          ["Waste qty",qty(report.inventoryMetrics.wasteQuantity)],
          ["Transfer qty",qty(report.inventoryMetrics.transferQuantity)],
        ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/7 bg-black/10 p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--business-muted)]">{label}</p><p className="mt-2 text-xl font-black text-[var(--business-text)]">{value}</p></div>)}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4">
          <h3 className="font-black text-[var(--business-text)]">Payment mix</h3>
          <div className="mt-3 space-y-2">{report.paymentMethods.map((row:any)=><div key={row.type} className="flex justify-between gap-3 text-sm"><span className="font-semibold text-[var(--business-muted)]">{title(row.type)}</span><span className="font-black text-[var(--business-text)]">{money(row.amountCents)}</span></div>)}</div>
        </div>
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4">
          <h3 className="font-black text-[var(--business-text)]">Course mix</h3>
          <div className="mt-3 space-y-2">{report.courseMix.map((row:any)=><div key={row.course} className="flex justify-between gap-3 text-sm"><span className="font-semibold text-[var(--business-muted)]">{title(row.course)}</span><span className="font-black text-[var(--business-text)]">{row.orders}</span></div>)}</div>
        </div>
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4">
          <h3 className="font-black text-[var(--business-text)]">Server performance</h3>
          <div className="mt-3 space-y-2">{report.serverPerformance.slice(0,8).map((row:any)=><div key={row.staffProfileId||"unassigned"} className="flex justify-between gap-3 text-sm"><span className="font-semibold text-[var(--business-muted)]">{row.name} · {row.checks}</span><span className="font-black text-[var(--business-text)]">{money(row.netSalesCents)}</span></div>)}</div>
        </div>
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4">
          <h3 className="font-black text-[var(--business-text)]">Inventory movement</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="font-semibold text-[var(--business-muted)]">Recipe usage</span><span className="font-black text-[var(--business-text)]">{qty(report.inventoryMetrics.recipeUsageQuantity)}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-[var(--business-muted)]">Waste</span><span className="font-black text-[var(--business-text)]">{qty(report.inventoryMetrics.wasteQuantity)}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-[var(--business-muted)]">Waste events</span><span className="font-black text-[var(--business-text)]">{report.inventoryMetrics.wasteEvents}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-[var(--business-muted)]">Transfers</span><span className="font-black text-[var(--business-text)]">{report.inventoryMetrics.transferEvents}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4"><h3 className="font-black text-[var(--business-text)]">Top items</h3><div className="mt-3 space-y-2">{report.topItems.slice(0,10).map((row:any)=><div key={row.name} className="flex justify-between gap-3 text-sm"><span className="font-semibold text-[var(--business-muted)]">{row.name} · {qty(row.quantity)}</span><span className="font-black text-[var(--business-text)]">{money(row.salesCents)}</span></div>)}</div></div>
        <div className="rounded-2xl border border-white/7 bg-black/10 p-4"><h3 className="font-black text-[var(--business-text)]">Sales detail</h3><div className="mt-3 space-y-2 text-sm">
          {[["Gross",report.metrics.grossSalesCents],["Discounts",report.metrics.discountsCents],["Refunds",report.metrics.refundsCents],["Tax",report.metrics.taxCents],["Tips",report.metrics.tipsCents]].map(([label,value])=><div key={String(label)} className="flex justify-between"><span className="font-semibold text-[var(--business-muted)]">{label}</span><span className="font-black text-[var(--business-text)]">{money(Number(value))}</span></div>)}
        </div></div>
      </div>
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Cash drawer closeout</p>
        <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Expected vs counted cash</h2>
        <div className="mt-4 space-y-2">{(managerOps.drawers||[]).slice(0,12).map((drawer:any)=><div key={drawer.id} className="rounded-xl border border-white/7 bg-black/10 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-black text-[var(--business-text)]">{drawer.status==="open"?"Open drawer":"Closed drawer"}</p><p className="text-xs font-semibold text-[var(--business-muted)]">{drawer.device_id} · {new Date(drawer.opened_at).toLocaleString()}</p></div>
            <span className="text-xs font-black text-[var(--business-text)]">{drawer.status==="open"?"OPEN":money(Number(drawer.over_short_cents||0))}</span>
          </div>
          {drawer.status==="closed"?<div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><p className="font-semibold text-[var(--business-muted)]">Expected</p><p className="font-black text-[var(--business-text)]">{money(Number(drawer.expected_cash_cents||0))}</p></div>
            <div><p className="font-semibold text-[var(--business-muted)]">Counted</p><p className="font-black text-[var(--business-text)]">{money(Number(drawer.counted_cash_cents||0))}</p></div>
            <div><p className="font-semibold text-[var(--business-muted)]">Over / short</p><p className="font-black text-[var(--business-text)]">{money(Number(drawer.over_short_cents||0))}</p></div>
          </div>:null}
        </div>)}</div>
        {!(managerOps.drawers||[]).length?<p className="mt-4 text-sm font-semibold text-[var(--business-muted)]">No drawer sessions yet.</p>:null}
      </div>

      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Manager audit</p>
        <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Voids, discounts, and refunds</h2>
        <div className="mt-4 space-y-2">{(managerOps.events||[]).slice(0,20).map((event:any)=><div key={event.id} className="border-b border-white/5 py-3">
          <div className="flex items-center justify-between gap-3"><p className="font-black text-[var(--business-text)]">{title(String(event.action||"manager action"))}</p><p className="font-black text-[#ff8da0]">{event.amount_cents==null?"":money(Number(event.amount_cents))}</p></div>
          <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{event.reason} · {new Date(event.created_at).toLocaleString()}</p>
        </div>)}</div>
        {!(managerOps.events||[]).length?<p className="mt-4 text-sm font-semibold text-[var(--business-muted)]">No manager events yet.</p>:null}
      </div>
    </section>
    <section className="mt-6 grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--business-muted)]">Recent waste</p>
        <div className="mt-3 space-y-2">{(inventory.recentWaste||[]).slice(0,10).map((row:any)=><div key={row.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-2"><div><p className="font-black text-[var(--business-text)]">{row.ingredientName}</p><p className="text-xs font-semibold text-[var(--business-muted)]">{row.reason}</p></div><p className="font-black text-[#ff8da0]">{qty(Math.abs(row.quantityDelta))}</p></div>)}</div>
      </div>
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--business-muted)]">Recent transfers</p>
        <div className="mt-3 space-y-2">{(inventory.recentTransfers||[]).slice(0,10).map((row:any)=><div key={row.id} className="border-b border-white/5 py-2"><div className="flex items-center justify-between gap-3"><p className="font-black text-[var(--business-text)]">{row.ingredientName}</p><p className="font-black text-[var(--business-text)]">{qty(row.quantity)}</p></div><p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">{row.fromStockAreaName} → {row.toStockAreaName}</p></div>)}</div>
      </div>
    </section>
  </BusinessPageShell>;
}
