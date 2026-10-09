import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { PosClaimSession } from "@/lib/device/identity";
import type { RoleBasedPosOutputRouter } from "@/lib/output/routing";
import {
  applyPosDiscountCloud,
  closePosDrawerSessionCloud,
  fetchPosManagerControls,
  openPosDrawerSessionCloud,
  recordPosCashTenderCloud,
  refundPosTenderCloud,
  voidPosItemCloud,
  type PosManagerControlData,
} from "@/lib/device/cloud";

function money(cents:number){return "$"+(Number(cents||0)/100).toFixed(2);}
function cents(value:string){
  const number=Number(String(value||"").replace(/[$,]/g,""));
  if(!Number.isFinite(number)||number<0) return null;
  return Math.round(number*100);
}
function pretty(value:string){return String(value||"").replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());}
function asciiBytes(value:string){
  const clean=Array.from(value).map(ch=>ch.charCodeAt(0)>=32&&ch.charCodeAt(0)<=126?ch:"?").join("");
  return Uint8Array.from(Array.from(clean).map(ch=>ch.charCodeAt(0)));
}
function receiptPayload(lines:string[]){
  const body=asciiBytes("\x1b@"+lines.join("\n")+"\n\n\n");
  const cut=Uint8Array.from([0x1d,0x56,0x00]);
  const out=new Uint8Array(body.length+cut.length);out.set(body,0);out.set(cut,body.length);return out;
}

export default function ManagerControlsWorkspace({
  session,router,refreshToken=0,
}:{session:PosClaimSession;router:RoleBasedPosOutputRouter|null;refreshToken?:number}){
  const [data,setData]=useState<PosManagerControlData|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [checkId,setCheckId]=useState("");
  const [actorId,setActorId]=useState("");
  const [managerId,setManagerId]=useState("");
  const [managerPin,setManagerPin]=useState("");
  const [cashReceived,setCashReceived]=useState("");
  const [cashAmount,setCashAmount]=useState("");
  const [tip,setTip]=useState("");
  const [discount,setDiscount]=useState("");
  const [reason,setReason]=useState("");
  const [tenderId,setTenderId]=useState("");
  const [refundAmount,setRefundAmount]=useState("");
  const [itemId,setItemId]=useState("");
  const [openingCash,setOpeningCash]=useState("");
  const [countedCash,setCountedCash]=useState("");

  const load=useCallback(async(quiet=false)=>{
    if(!quiet)setBusy(true);
    try{
      const next=await fetchPosManagerControls({deviceId:session.deviceId,credential:session.credential});
      setData(next);setMessage("");
      const open=next.checks.find((row:any)=>["open","held"].includes(String(row.status)));
      if(!checkId&&open)setCheckId(String(open.id));
      if(!actorId&&next.staff[0])setActorId(String(next.staff[0].id));
      if(!managerId&&next.managers[0])setManagerId(String(next.managers[0].id));
    }catch(e){setMessage(e instanceof Error?pretty(e.message):"Unable to load manager controls.");}
    finally{if(!quiet)setBusy(false)}
  },[session.deviceId,session.credential,checkId,actorId,managerId]);

  useEffect(()=>{void load();},[session.deviceId]);
  useEffect(()=>{if(refreshToken>0)void load(true);},[refreshToken]);

  const mutate=async(fn:()=>Promise<any>,success:string)=>{
    setBusy(true);setMessage("");
    try{const result=await fn();setMessage(success);await load(true);return result;}
    catch(e){setMessage(e instanceof Error?pretty(e.message):"Unable to complete action.");}
    finally{setBusy(false)}
  };

  const selectedCheck=useMemo(()=>data?.checks.find((row:any)=>String(row.id)===checkId)||null,[data,checkId]);
  const checkTenders=useMemo(()=>data?.tenders.filter((row:any)=>String(row.check_id)===checkId)||[],[data,checkId]);
  const checkItems=useMemo(()=>data?.items.filter((row:any)=>String(row.check_id)===checkId)||[],[data,checkId]);
  const openDrawer=data?.drawers.find((row:any)=>String(row.status)==="open")||null;

  const payCash=()=>mutate(async()=>{
    const received=cents(cashReceived),amount=cashAmount.trim()?cents(cashAmount):null,tipCents=cents(tip||"0");
    if(received==null||received<=0||tipCents==null)throw new Error("Enter valid cash amounts");
    const result=await recordPosCashTenderCloud({
      deviceId:session.deviceId,credential:session.credential,checkId,
      cashReceivedCents:received,amountCents:amount,tipCents,
      actorStaffProfileId:actorId||null,
    });
    try{await router?.openCashDrawer();}catch{setMessage("Cash recorded. Drawer route needs attention.");}
    setCashReceived("");setCashAmount("");setTip("");
    return result;
  },"Cash payment recorded.");

  const printReceipt=async()=>{
    if(!selectedCheck) return;
    const lines=[
      "ThePOSHaven",
      "Receipt "+String(selectedCheck.id).slice(0,8).toUpperCase(),
      "--------------------------------",
      ...checkItems.filter((row:any)=>row.status!=="voided").map((row:any)=>`${row.quantity}x ${String(row.item_name).slice(0,20)}  ${money(row.line_total_cents)}`),
      "--------------------------------",
      `Subtotal: ${money(selectedCheck.subtotal_cents)}`,
      selectedCheck.discount_cents?`Discount: -${money(selectedCheck.discount_cents)}`:"",
      `Tax: ${money(selectedCheck.tax_cents)}`,
      selectedCheck.service_charge_cents?`Service: ${money(selectedCheck.service_charge_cents)}`:"",
      `Total: ${money(selectedCheck.total_cents)}`,
      `Paid: ${money(selectedCheck.amount_paid_cents)}`,
      selectedCheck.amount_refunded_cents?`Refunded: ${money(selectedCheck.amount_refunded_cents)}`:"",
      ...checkTenders.map((row:any)=>`${pretty(row.tender_type)} #${row.tender_number}: ${money(row.amount_cents)}`),
      "",
      "Thank you",
    ].filter(Boolean);
    setBusy(true);setMessage("");
    try{
      if(!router)throw new Error("Receipt printer routing unavailable");
      await router.send("receipt",receiptPayload(lines));
      setMessage("Receipt printed.");
    }catch(e){setMessage(e instanceof Error?pretty(e.message):"Receipt print failed.");}
    finally{setBusy(false)}
  };

  if(!data&&busy)return <View style={styles.center}><ActivityIndicator/><Text style={styles.muted}>Loading payments…</Text></View>;
  const chips=(rows:any[],selected:string,setter:(id:string)=>void,label:(row:any)=>string)=>(
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {rows.map(row=><Pressable key={row.id} onPress={()=>setter(String(row.id))} style={[styles.chip,selected===String(row.id)&&styles.chipActive]}><Text style={styles.chipText}>{label(row)}</Text></Pressable>)}
    </ScrollView>
  );

  return <ScrollView style={styles.root} contentContainerStyle={styles.body}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>Essentials+ / Signature+</Text><Text style={styles.title}>Payments & Manager</Text><Text style={styles.muted}>Cash · refunds · voids · discounts · drawer closeout · receipts</Text></View></View>
    {!!message&&<Text style={styles.message}>{message}</Text>}

    <Text style={styles.label}>Check</Text>
    {chips(data?.checks||[],checkId,setCheckId,(row:any)=>`${String(row.id).slice(0,6)} · ${pretty(row.status)} · ${money(row.total_cents)}`)}
    <Text style={styles.label}>Staff</Text>
    {chips(data?.staff||[],actorId,setActorId,(row:any)=>`${row.display_name} · ${pretty(row.role)}`)}
    <Text style={styles.label}>Manager approval</Text>
    {chips(data?.managers||[],managerId,setManagerId,(row:any)=>`${row.display_name}`)}
    <TextInput value={managerPin} onChangeText={setManagerPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Manager PIN for protected actions" placeholderTextColor="#656a72" style={styles.input}/>

    <View style={styles.grid}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cash payment</Text>
        <TextInput value={cashReceived} onChangeText={setCashReceived} keyboardType="decimal-pad" placeholder="Cash received $" placeholderTextColor="#656a72" style={styles.input}/>
        <TextInput value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" placeholder="Apply $ (blank = remaining)" placeholderTextColor="#656a72" style={styles.input}/>
        <TextInput value={tip} onChangeText={setTip} keyboardType="decimal-pad" placeholder="Tip $" placeholderTextColor="#656a72" style={styles.input}/>
        <Pressable disabled={busy||!checkId} onPress={payCash} style={styles.primary}><Text style={styles.primaryText}>Record cash + open drawer</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Discount / comp</Text>
        <TextInput value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="Discount $" placeholderTextColor="#656a72" style={styles.input}/>
        <TextInput value={reason} onChangeText={setReason} placeholder="Required reason" placeholderTextColor="#656a72" style={styles.input}/>
        <Pressable disabled={busy||!checkId||!managerId||!managerPin} onPress={()=>mutate(()=>{
          const value=cents(discount);if(value==null)throw new Error("Enter discount");
          return applyPosDiscountCloud({deviceId:session.deviceId,credential:session.credential,checkId,discountCents:value,actorStaffProfileId:actorId,approverStaffProfileId:managerId,managerPin,reason});
        },"Discount applied.")} style={styles.secondary}><Text style={styles.secondaryText}>Apply with manager approval</Text></Pressable>
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Void item</Text>
      {chips(checkItems.filter((row:any)=>row.status!=="voided"),itemId,setItemId,(row:any)=>`${row.item_name} · ${money(row.line_total_cents)}`)}
      <Pressable disabled={busy||!itemId||!managerId||!managerPin||!reason} onPress={()=>mutate(()=>voidPosItemCloud({deviceId:session.deviceId,credential:session.credential,orderItemId:itemId,actorStaffProfileId:actorId,approverStaffProfileId:managerId,managerPin,reason}),"Item voided.")} style={styles.secondary}><Text style={styles.secondaryText}>Void selected item</Text></Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Refund tender</Text>
      {chips(checkTenders.filter((row:any)=>["completed","partially_refunded"].includes(String(row.status))),tenderId,setTenderId,(row:any)=>`${pretty(row.tender_type)} #${row.tender_number} · ${money(row.amount_cents-row.amount_refunded_cents)} left`)}
      <TextInput value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" placeholder="Refund $" placeholderTextColor="#656a72" style={styles.input}/>
      <Pressable disabled={busy||!tenderId||!managerId||!managerPin||!reason} onPress={()=>mutate(()=>{
        const value=cents(refundAmount);if(value==null||value<=0)throw new Error("Enter refund amount");
        return refundPosTenderCloud({deviceId:session.deviceId,credential:session.credential,tenderId,amountCents:value,actorStaffProfileId:actorId,approverStaffProfileId:managerId,managerPin,reason,idempotencyKey:`pos-refund-${tenderId}-${value}-${Date.now()}`});
      },"Refund completed.")} style={styles.secondary}><Text style={styles.secondaryText}>Refund selected tender</Text></Pressable>
    </View>

    <View style={styles.grid}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cash drawer shift</Text>
        {!openDrawer?<><TextInput value={openingCash} onChangeText={setOpeningCash} keyboardType="decimal-pad" placeholder="Opening cash $" placeholderTextColor="#656a72" style={styles.input}/>
          <Pressable disabled={busy} onPress={()=>mutate(async()=>{
            const value=cents(openingCash||"0");if(value==null)throw new Error("Enter opening cash");
            const result=await openPosDrawerSessionCloud({deviceId:session.deviceId,credential:session.credential,openingCashCents:value,actorStaffProfileId:actorId||null});
            try{await router?.openCashDrawer();}catch{}
            return result;
          },"Drawer shift opened.")} style={styles.secondary}><Text style={styles.secondaryText}>Open shift</Text></Pressable></>
        :<><Text style={styles.muted}>Opened {new Date(openDrawer.opened_at).toLocaleTimeString()}</Text>
          <TextInput value={countedCash} onChangeText={setCountedCash} keyboardType="decimal-pad" placeholder="Counted cash $" placeholderTextColor="#656a72" style={styles.input}/>
          <Pressable disabled={busy||!managerId||!managerPin} onPress={()=>mutate(()=>{
            const value=cents(countedCash);if(value==null)throw new Error("Enter counted cash");
            return closePosDrawerSessionCloud({deviceId:session.deviceId,credential:session.credential,sessionId:String(openDrawer.id),countedCashCents:value,approverStaffProfileId:managerId,managerPin});
          },"Drawer shift closed.")} style={styles.secondary}><Text style={styles.secondaryText}>Close + reconcile</Text></Pressable></>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Receipt</Text>
        <Text style={styles.muted}>{selectedCheck?`Check ${String(selectedCheck.id).slice(0,8)} · ${money(selectedCheck.total_cents)}`:"Select a check"}</Text>
        <Pressable disabled={busy||!selectedCheck} onPress={printReceipt} style={styles.secondary}><Text style={styles.secondaryText}>Print / reprint receipt</Text></Pressable>
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Manager audit</Text>
      {(data?.events||[]).slice(0,12).map((row:any)=><View key={row.id} style={styles.audit}><Text style={styles.auditAction}>{pretty(row.action)}</Text><Text style={styles.muted}>{row.reason} · {row.amount_cents==null?"—":money(row.amount_cents)}</Text></View>)}
      {!(data?.events||[]).length&&<Text style={styles.muted}>No manager adjustments yet.</Text>}
    </View>
  </ScrollView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#07080a"},body:{padding:12,paddingBottom:90,gap:12},center:{flex:1,alignItems:"center",justifyContent:"center",gap:8,backgroundColor:"#07080a"},
  header:{paddingVertical:4},eyebrow:{color:"#ff5d71",fontSize:10,fontWeight:"900",letterSpacing:1.3,textTransform:"uppercase"},title:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:3},
  muted:{color:"#8c919a",fontSize:11,fontWeight:"600",marginTop:3},message:{borderRadius:10,borderWidth:1,borderColor:"#3b414a",padding:10,color:"#f2f3f5",fontSize:11,fontWeight:"700"},
  label:{color:"#aeb3bc",fontSize:10,fontWeight:"900",letterSpacing:1,textTransform:"uppercase"},chips:{gap:7},chip:{borderRadius:999,borderWidth:1,borderColor:"#30353d",paddingHorizontal:11,paddingVertical:8},
  chipActive:{borderColor:"#ff5368",backgroundColor:"#251217"},chipText:{color:"#ddd",fontSize:10,fontWeight:"800"},grid:{flexDirection:"row",flexWrap:"wrap",gap:10},
  card:{flexGrow:1,flexBasis:280,borderRadius:15,borderWidth:1,borderColor:"#2c3037",backgroundColor:"#11141a",padding:13,gap:9},cardTitle:{color:"#fff",fontSize:16,fontWeight:"900"},
  input:{borderRadius:10,borderWidth:1,borderColor:"#30353d",backgroundColor:"#090b0e",paddingHorizontal:11,paddingVertical:10,color:"#fff",fontSize:12,fontWeight:"700"},
  primary:{borderRadius:10,backgroundColor:"#d91d37",padding:11,alignItems:"center"},primaryText:{color:"#fff",fontSize:11,fontWeight:"900"},
  secondary:{borderRadius:10,borderWidth:1,borderColor:"#434851",padding:11,alignItems:"center"},secondaryText:{color:"#f0f1f3",fontSize:11,fontWeight:"900"},
  audit:{borderBottomWidth:1,borderBottomColor:"#22262c",paddingVertical:8},auditAction:{color:"#fff",fontSize:12,fontWeight:"900"},
});
