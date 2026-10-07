import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PosClaimSession } from "@/lib/device/identity";
import {
  createSignaturePlusSplit,
  createSignaturePlusSplitTender,
  fetchSignaturePlus,
  moveSignaturePlusTable,
  transferSignaturePlusServer,
  updateSignaturePlusCourse,
  type SignaturePlusKdsTicket,
  type SignaturePlusReport,
} from "@/lib/device/cloud";

type Tab="kds"|"tables"|"inventory"|"reports";
function money(cents:number){return "$"+(Number(cents||0)/100).toFixed(2);}
function pretty(value:string){return String(value||"").replace(/_/g," ").replace(/w/g,m=>m.toUpperCase());}

export default function SignaturePlusWorkspace({session,refreshToken=0}:{session:PosClaimSession;refreshToken?:number}){
  const [tab,setTab]=useState<Tab>("kds");
  const [data,setData]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [station,setStation]=useState("all");
  const [selectedCheck,setSelectedCheck]=useState<string|null>(null);
  const [splitPlan,setSplitPlan]=useState<any>(null);

  const load=useCallback(async(quiet=false)=>{
    if(!quiet) setBusy(true);
    try{
      const next=await fetchSignaturePlus({deviceId:session.deviceId,credential:session.credential});
      setData(next);setError("");
      if(!selectedCheck&&next.operations?.openChecks?.length) setSelectedCheck(next.operations.openChecks[0].id);
    }catch(e){setError(e instanceof Error?pretty(e.message):"Unable to load Signature+.");}
    finally{if(!quiet)setBusy(false)}
  },[session.deviceId,session.credential,selectedCheck]);

  useEffect(()=>{void load();},[session.deviceId]);
  useEffect(()=>{if(refreshToken>0) void load(true);},[refreshToken]);

  const mutate=async(operation:()=>Promise<any>)=>{
    setBusy(true);setError("");
    try{const result=await operation();await load(true);return result;}
    catch(e){setError(e instanceof Error?pretty(e.message):"Unable to update Signature+.");}
    finally{setBusy(false)}
  };

  const kds=(data?.kds||[]) as SignaturePlusKdsTicket[];
  const stations=useMemo(()=>Array.from(new Set(kds.flatMap(ticket=>ticket.stations))).sort(),[kds]);
  const visibleKds=station==="all"?kds:kds.filter(ticket=>ticket.lines.some(line=>line.station===station));
  const ops=data?.operations||{openChecks:[],tables:[],staff:[]};
  const currentCheck=ops.openChecks?.find((check:any)=>check.id===selectedCheck)||ops.openChecks?.[0]||null;
  const inventory=data?.inventory||{ingredients:[],recipes:[]};
  const report=(data?.report||null) as SignaturePlusReport|null;

  if(!data&&busy) return <View style={styles.center}><ActivityIndicator/><Text style={styles.muted}>Loading Signature+…</Text></View>;

  return <View style={styles.root}>
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>Signature+</Text><Text style={styles.title}>Advanced Operations</Text><Text style={styles.muted}>KDS · Table Ops · Ingredient Inventory · Advanced Reporting</Text></View>
      <View style={styles.live}><Text style={styles.liveText}>LIVE SYNC</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {(["kds","tables","inventory","reports"] as Tab[]).map(key=><Pressable key={key} onPress={()=>setTab(key)} style={[styles.tab,tab===key&&styles.tabActive]}><Text style={[styles.tabText,tab===key&&styles.tabTextActive]}>{key==="kds"?"KDS":key==="tables"?"Table Ops":key==="inventory"?"Inventory":"Reports"}</Text></Pressable>)}
    </ScrollView>
    {!!error&&<Text style={styles.error}>{error}</Text>}

    {tab==="kds"&&<ScrollView contentContainerStyle={styles.body}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stationRow}>
        <Pressable onPress={()=>setStation("all")} style={[styles.chip,station==="all"&&styles.chipActive]}><Text style={styles.chipText}>All Stations</Text></Pressable>
        {stations.map(name=><Pressable key={name} onPress={()=>setStation(name)} style={[styles.chip,station===name&&styles.chipActive]}><Text style={styles.chipText}>{pretty(name)}</Text></Pressable>)}
      </ScrollView>
      <View style={styles.grid}>
        {visibleKds.map(ticket=><View key={ticket.id} style={[styles.ticket,ticket.held&&styles.ticketHeld]}>
          <View style={styles.rowBetween}><Text style={styles.ticketTable}>{ticket.tableLabels.join(" + ")||"Order"}</Text><Text style={styles.timer}>{Math.floor(ticket.elapsedSeconds/60)}m</Text></View>
          <Text style={styles.course}>{pretty(ticket.course)} · {pretty(ticket.status)}{ticket.held?" · HOLD":""}</Text>
          <View style={styles.lines}>{ticket.lines.filter(line=>station==="all"||line.station===station).map(line=><View key={line.id} style={styles.line}><Text style={styles.qty}>{line.quantity}×</Text><View style={styles.lineMain}><Text style={styles.lineName}>{line.name}{line.seatNumber?" · Seat "+line.seatNumber:""}</Text><Text style={styles.lineMeta}>{pretty(line.station)}</Text>{line.notes?<Text style={styles.note}>Note: {line.notes}</Text>:null}</View></View>)}</View>
          <View style={styles.actions}>
            {ticket.status==="sent"&&!ticket.held&&<Pressable onPress={()=>mutate(()=>updateSignaturePlusCourse({deviceId:session.deviceId,credential:session.credential,orderId:ticket.id,courseAction:"hold"}))} style={styles.secondary}><Text style={styles.secondaryText}>Hold</Text></Pressable>}
            {ticket.held&&<Pressable onPress={()=>mutate(()=>updateSignaturePlusCourse({deviceId:session.deviceId,credential:session.credential,orderId:ticket.id,courseAction:"release_hold"}))} style={styles.secondary}><Text style={styles.secondaryText}>Release</Text></Pressable>}
            <Pressable onPress={()=>mutate(()=>updateSignaturePlusCourse({deviceId:session.deviceId,credential:session.credential,orderId:ticket.id,courseAction:ticket.status==="fired"?"ready":"fire"}))} disabled={ticket.held||busy} style={[styles.primary,ticket.status==="fired"&&styles.ready,ticket.held&&styles.disabled]}><Text style={styles.primaryText}>{ticket.status==="fired"?"Mark Ready":"Fire"}</Text></Pressable>
          </View>
        </View>)}
      </View>
      {!visibleKds.length&&<View style={styles.empty}><Text style={styles.emptyTitle}>Kitchen is clear</Text><Text style={styles.muted}>Sent and fired orders will appear here automatically.</Text></View>}
    </ScrollView>}

    {tab==="tables"&&<ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.sectionTitle}>Open Checks</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stationRow}>
        {ops.openChecks?.map((check:any)=><Pressable key={check.id} onPress={()=>setSelectedCheck(check.id)} style={[styles.checkChip,selectedCheck===check.id&&styles.checkChipActive]}><Text style={styles.checkTitle}>{check.tables?.map((t:any)=>t.label).join(" + ")||"Open Check"}</Text><Text style={styles.checkMeta}>{check.guestCount} guests · {money(check.totalCents)}</Text></Pressable>)}
      </ScrollView>
      {currentCheck?<View style={styles.panel}>
        <View style={styles.rowBetween}><View><Text style={styles.panelTitle}>{currentCheck.tables?.map((t:any)=>t.label).join(" + ")||"Open Check"}</Text><Text style={styles.muted}>{currentCheck.server?.name||"No server assigned"} · {currentCheck.guestCount} guests</Text></View><Text style={styles.total}>{money(currentCheck.totalCents)}</Text></View>

        <Text style={styles.label}>Move / Merge Table</Text>
        <View style={styles.optionGrid}>{ops.tables?.map((table:any)=><View key={table.id} style={styles.optionCard}><Text style={styles.optionTitle}>{table.label}</Text><Text style={styles.muted}>Capacity {table.capacity}</Text><View style={styles.inlineActions}><Pressable onPress={()=>mutate(()=>moveSignaturePlusTable({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,targetLayoutItemId:table.id}))} style={styles.secondary}><Text style={styles.secondaryText}>Move</Text></Pressable><Pressable onPress={()=>mutate(()=>moveSignaturePlusTable({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,targetLayoutItemId:table.id,merge:true}))} style={styles.secondary}><Text style={styles.secondaryText}>Merge</Text></Pressable></View></View>)}</View>

        <Text style={styles.label}>Transfer Server</Text>
        <View style={styles.optionGrid}>{ops.staff?.map((staff:any)=><Pressable key={staff.id} onPress={()=>mutate(()=>transferSignaturePlusServer({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,staffProfileId:staff.id}))} style={styles.optionCard}><Text style={styles.optionTitle}>{staff.name}</Text><Text style={styles.muted}>{pretty(staff.role)}</Text></Pressable>)}</View>

        <Text style={styles.label}>Split Check</Text>
        <View style={styles.inlineActions}>
          <Pressable onPress={()=>mutate(()=>createSignaturePlusSplit({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,mode:"by_guest"})).then(setSplitPlan)} style={styles.secondary}><Text style={styles.secondaryText}>By Guest</Text></Pressable>
          <Pressable onPress={()=>mutate(()=>createSignaturePlusSplit({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,mode:"even",parts:currentCheck.guestCount})).then(setSplitPlan)} style={styles.secondary}><Text style={styles.secondaryText}>Even Split</Text></Pressable>
        </View>
        {splitPlan?.allocations?.length?<View style={{marginTop:12,gap:8}}>
          {splitPlan.allocations.map((part:any)=><View key={part.key} style={styles.reportRow}>
            <View><Text style={styles.optionTitle}>{part.label}</Text><Text style={styles.muted}>{money(part.amountCents)}</Text></View>
            <Pressable disabled={busy} onPress={()=>mutate(()=>createSignaturePlusSplitTender({deviceId:session.deviceId,credential:session.credential,checkId:currentCheck.id,allocationKey:part.key}))} style={styles.primary}><Text style={styles.primaryText}>Charge card</Text></Pressable>
          </View>)}
        </View>:null}
      </View>:<View style={styles.empty}><Text style={styles.emptyTitle}>No open table checks</Text></View>}
    </ScrollView>}

    {tab==="inventory"&&<ScrollView contentContainerStyle={styles.body}>
      <View style={styles.metricsRow}><View style={styles.metric}><Text style={styles.metricValue}>{inventory.ingredients?.length||0}</Text><Text style={styles.metricLabel}>Ingredients</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{inventory.ingredients?.filter((i:any)=>i.lowStock).length||0}</Text><Text style={styles.metricLabel}>Low Stock</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{inventory.recipes?.length||0}</Text><Text style={styles.metricLabel}>Recipes</Text></View></View>
      <Text style={styles.sectionTitle}>Ingredient Inventory</Text>
      {inventory.ingredients?.map((item:any)=><View key={item.id} style={styles.inventoryRow}><View><Text style={styles.optionTitle}>{item.name}</Text><Text style={styles.muted}>{item.quantityOnHand} {item.unit}{item.lowStock?" · Low stock":""}</Text></View><Text style={[styles.stock,item.soldOut&&styles.stockOut]}>{item.soldOut?"OUT":"IN STOCK"}</Text></View>)}
      <Text style={styles.sectionTitle}>Recipe Mapping</Text>
      {inventory.recipes?.map((recipe:any)=><View key={recipe.catalogItemId} style={styles.recipeCard}><Text style={styles.optionTitle}>{recipe.name}</Text><Text style={styles.muted}>{recipe.components.map((c:any)=>c.quantity+" "+c.unit).join(" · ")}</Text></View>)}
    </ScrollView>}

    {tab==="reports"&&report&&<ScrollView contentContainerStyle={styles.body}>
      <View style={styles.metricsRow}>
        <View style={styles.metric}><Text style={styles.metricValue}>{money(report.metrics.netSalesCents)}</Text><Text style={styles.metricLabel}>Net Sales</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{report.metrics.checks}</Text><Text style={styles.metricLabel}>Checks</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{money(report.metrics.averageCheckCents)}</Text><Text style={styles.metricLabel}>Avg Check</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{money(report.metrics.tipsCents)}</Text><Text style={styles.metricLabel}>Tips</Text></View>
      </View>
      <View style={styles.panel}><Text style={styles.sectionTitle}>Sales Detail</Text><View style={styles.reportRow}><Text style={styles.muted}>Gross sales</Text><Text style={styles.reportValue}>{money(report.metrics.grossSalesCents)}</Text></View><View style={styles.reportRow}><Text style={styles.muted}>Discounts</Text><Text style={styles.reportValue}>{money(report.metrics.discountsCents)}</Text></View><View style={styles.reportRow}><Text style={styles.muted}>Refunds</Text><Text style={styles.reportValue}>{money(report.metrics.refundsCents)}</Text></View><View style={styles.reportRow}><Text style={styles.muted}>Tax</Text><Text style={styles.reportValue}>{money(report.metrics.taxCents)}</Text></View></View>
      <View style={styles.panel}><Text style={styles.sectionTitle}>Payment Methods</Text>{report.paymentMethods.map(row=><View key={row.type} style={styles.reportRow}><Text style={styles.muted}>{pretty(row.type)}</Text><Text style={styles.reportValue}>{money(row.amountCents)}</Text></View>)}</View>
      <View style={styles.panel}><Text style={styles.sectionTitle}>Top Items</Text>{report.topItems.slice(0,10).map(row=><View key={row.name} style={styles.reportRow}><Text style={styles.muted}>{row.name} · {row.quantity}</Text><Text style={styles.reportValue}>{money(row.salesCents)}</Text></View>)}</View>
    </ScrollView>}
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#07080a"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10,backgroundColor:"#07080a"},
  header:{padding:16,borderBottomWidth:1,borderBottomColor:"#202329",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  eyebrow:{color:"#ff5d71",fontSize:10,fontWeight:"900",letterSpacing:1.5,textTransform:"uppercase"},title:{color:"#fff",fontSize:25,fontWeight:"900",marginTop:3},
  muted:{color:"#8d9098",fontSize:11,fontWeight:"600",marginTop:2},live:{borderRadius:999,borderWidth:1,borderColor:"#28583f",backgroundColor:"#0d2117",paddingHorizontal:10,paddingVertical:7},
  liveText:{color:"#79d49d",fontSize:9,fontWeight:"900",letterSpacing:1},tabs:{gap:7,padding:10,borderBottomWidth:1,borderBottomColor:"#202329"},tab:{borderRadius:11,borderWidth:1,borderColor:"#2c3037",paddingHorizontal:14,paddingVertical:9},
  tabActive:{backgroundColor:"#d91d37",borderColor:"#ff5368"},tabText:{color:"#aaaeb6",fontSize:11,fontWeight:"900"},tabTextActive:{color:"#fff"},
  error:{margin:10,padding:10,borderRadius:10,backgroundColor:"#3a151a",color:"#ffb2bd",fontSize:11,fontWeight:"700"},body:{padding:12,paddingBottom:80,gap:12},
  stationRow:{gap:7},chip:{borderRadius:999,borderWidth:1,borderColor:"#2d3138",paddingHorizontal:12,paddingVertical:8},chipActive:{backgroundColor:"#272f3d",borderColor:"#4b5d78"},chipText:{color:"#ddd",fontSize:10,fontWeight:"800"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10},ticket:{flexGrow:1,flexBasis:260,maxWidth:420,borderRadius:16,borderWidth:1,borderColor:"#30343a",backgroundColor:"#11141a",padding:13},ticketHeld:{borderColor:"#a86e22",backgroundColor:"#1c1710"},
  rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},ticketTable:{color:"#fff",fontSize:18,fontWeight:"900"},timer:{color:"#ff7a8b",fontSize:16,fontWeight:"900"},
  course:{color:"#969aa2",fontSize:10,fontWeight:"800",marginTop:3,textTransform:"uppercase"},lines:{marginTop:12,gap:8},line:{flexDirection:"row",gap:8},qty:{color:"#ff6679",fontSize:14,fontWeight:"900",width:24},
  lineMain:{flex:1},lineName:{color:"#fff",fontSize:13,fontWeight:"800"},lineMeta:{color:"#777c85",fontSize:9,fontWeight:"800",marginTop:2,textTransform:"uppercase"},note:{color:"#e4bd67",fontSize:10,fontWeight:"700",marginTop:2},
  actions:{flexDirection:"row",gap:7,marginTop:13},secondary:{borderRadius:10,borderWidth:1,borderColor:"#343840",paddingHorizontal:12,paddingVertical:10,alignItems:"center"},secondaryText:{color:"#e3e4e7",fontSize:10,fontWeight:"900"},
  primary:{flex:1,borderRadius:10,backgroundColor:"#d91d37",paddingHorizontal:12,paddingVertical:10,alignItems:"center"},ready:{backgroundColor:"#247448"},disabled:{opacity:.35},primaryText:{color:"#fff",fontSize:10,fontWeight:"900"},
  empty:{padding:30,alignItems:"center"},emptyTitle:{color:"#fff",fontSize:19,fontWeight:"900"},sectionTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginTop:4},
  checkChip:{minWidth:160,borderRadius:13,borderWidth:1,borderColor:"#30343a",backgroundColor:"#11141a",padding:11},checkChipActive:{borderColor:"#ff5368",backgroundColor:"#251217"},
  checkTitle:{color:"#fff",fontSize:13,fontWeight:"900"},checkMeta:{color:"#8d9098",fontSize:10,fontWeight:"700",marginTop:3},panel:{borderRadius:16,borderWidth:1,borderColor:"#2c3037",backgroundColor:"#101318",padding:14},
  panelTitle:{color:"#fff",fontSize:20,fontWeight:"900"},total:{color:"#fff",fontSize:22,fontWeight:"900"},label:{color:"#aeb1b8",fontSize:10,fontWeight:"900",letterSpacing:1,textTransform:"uppercase",marginTop:18,marginBottom:7},
  optionGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},optionCard:{minWidth:140,flexGrow:1,borderRadius:12,borderWidth:1,borderColor:"#2d3138",backgroundColor:"#15181e",padding:11},optionTitle:{color:"#fff",fontSize:12,fontWeight:"900"},
  inlineActions:{flexDirection:"row",gap:6,marginTop:8,flexWrap:"wrap"},metricsRow:{flexDirection:"row",flexWrap:"wrap",gap:8},metric:{flexGrow:1,minWidth:120,borderRadius:14,borderWidth:1,borderColor:"#2b3037",backgroundColor:"#11141a",padding:13},
  metricValue:{color:"#fff",fontSize:20,fontWeight:"900"},metricLabel:{color:"#81858e",fontSize:9,fontWeight:"900",textTransform:"uppercase",marginTop:3},inventoryRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderBottomWidth:1,borderBottomColor:"#22262c",paddingVertical:11},
  stock:{color:"#77d69b",fontSize:9,fontWeight:"900"},stockOut:{color:"#ff6c7d"},recipeCard:{borderRadius:12,borderWidth:1,borderColor:"#2c3037",backgroundColor:"#11141a",padding:12},
  reportRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#22262c"},reportValue:{color:"#fff",fontSize:12,fontWeight:"900"},
});
