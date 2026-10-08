import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  fetchPosActiveOnlineOrders,
  posClaimTransport,
  updatePosOnlineOrderStatus,
  type PosActiveOnlineOrder,
} from "@/lib/device/cloud";
import {
  claimPosDevice,
  getPosClaimSession,
  type PosClaimSession,
} from "@/lib/device/identity";
import { pollAndDispatchPosCommands } from "@/lib/device/command-dispatcher";
import { createSyncedPosOutputRouter } from "@/lib/output/local-runtime";
import type { RoleBasedPosOutputRouter } from "@/lib/output/routing";
import TableServiceWorkspace from "@/components/TableServiceWorkspace";
import SignaturePlusWorkspace from "@/components/SignaturePlusWorkspace";
import ManagerControlsWorkspace from "@/components/ManagerControlsWorkspace";

const NEXT_STATUS:Record<string,{label:string;status:"accepted"|"preparing"|"ready"|"completed"}>={
  received:{label:"Accept",status:"accepted"},
  accepted:{label:"Start preparing",status:"preparing"},
  preparing:{label:"Mark ready",status:"ready"},
  ready:{label:"Complete pickup",status:"completed"},
};

function money(cents:number){
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
}

function pickupLabel(value?:string|null){
  if(!value) return "ASAP";
  const date=new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})
    : "ASAP";
}

function statusLabel(value:string){
  if(value==="received") return "NEW";
  if(value==="accepted") return "ACCEPTED";
  if(value==="preparing") return "PREPARING";
  if(value==="ready") return "READY";
  return value.toUpperCase();
}

function receiptBytes(lines:string[]){
  const encoder=new TextEncoder();
  const text=encoder.encode(lines.join("\n")+"\n\n\n");
  const bytes=new Uint8Array(2+text.length+3);
  bytes.set([0x1b,0x40],0);
  bytes.set(text,2);
  bytes.set([0x1d,0x56,0x00],2+text.length);
  return bytes;
}

const cashDrawerBytes=Uint8Array.from([0x1b,0x70,0x00,0x3c,0x78]);

export default function CashierHome() {
  const [session,setSession]=useState<PosClaimSession|null>(null);
  const [pairingCode,setPairingCode]=useState("");
  const [claiming,setClaiming]=useState(false);
  const [orders,setOrders]=useState<PosActiveOnlineOrder[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");
  const [busyOrderId,setBusyOrderId]=useState<string|null>(null);
  const [outputSummary,setOutputSummary]=useState("Printer routing not synced");
  const [workspaceMode,setWorkspaceMode]=useState<"tables"|"payments"|"signature"|"online">("tables");
  const [posStateVersion,setPosStateVersion]=useState(0);
  const routerRef=useRef<RoleBasedPosOutputRouter|null>(null);

  const openCashDrawer=useCallback(async()=>{
    const router=routerRef.current;
    if(!router) throw new Error("pos_output_router_unavailable");
    await router.send("cash_drawer",cashDrawerBytes);
  },[]);

  const printReceipt=useCallback(async(lines:string[])=>{
    const router=routerRef.current;
    if(!router) throw new Error("pos_output_router_unavailable");
    await router.send("receipt",receiptBytes(lines));
  },[]);

  const loadOrders=useCallback(async (activeSession:PosClaimSession,quiet=false)=>{
    if(!quiet) setRefreshing(true);
    try{
      const active=await fetchPosActiveOnlineOrders({
        deviceId:activeSession.deviceId,
        credential:activeSession.credential,
      });
      setOrders(active);
      setMessage("");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Unable to load online orders.");
    }finally{
      setLoading(false);
      setRefreshing(false);
    }
  },[]);

  const syncOutput=useCallback(async(activeSession:PosClaimSession)=>{
    try{
      const synced=await createSyncedPosOutputRouter(activeSession);
      routerRef.current=synced.router;
      setOutputSummary(
        synced.routeCount
          ? `${synced.resolvedCount}/${synced.routeCount} output routes ready`
          : "No printer routes assigned",
      );
    }catch(error){
      routerRef.current=null;
      setOutputSummary(
        error instanceof Error?error.message.replaceAll("_"," "):"Printer routing unavailable",
      );
    }
  },[]);

  useEffect(()=>{
    let alive=true;
    getPosClaimSession()
      .then(async stored=>{
        if(!alive) return;
        setSession(stored);
        if(stored){
          await Promise.all([loadOrders(stored,true),syncOutput(stored)]);
        }else{
          setLoading(false);
        }
      })
      .catch(error=>{
        if(alive){
          setMessage(error instanceof Error?error.message:"Unable to read device setup.");
          setLoading(false);
        }
      });
    return()=>{alive=false};
  },[loadOrders,syncOutput]);

  useEffect(()=>{
    if(!session) return;
    let cancelled=false;
    const run=async()=>{
      while(!cancelled){
        const router=routerRef.current;
        if(!router){await new Promise(resolve=>setTimeout(resolve,500));continue;}
        try{
          const results=await pollAndDispatchPosCommands({session,router,maxCommands:10,waitSeconds:25});
          if(cancelled) return;
          if(results.some(result=>result.commandType==="pos_state_changed")){
            setPosStateVersion(version=>version+1);
          }
          if(results.some(result=>result.commandType==="online_order_received"||result.commandType==="online_order_status_changed")){
            await loadOrders(session,true);
          }
        }catch{
          if(!cancelled) await new Promise(resolve=>setTimeout(resolve,1000));
        }
      }
    };
    void run();
    return()=>{cancelled=true};
  },[session,loadOrders]);

  const claim=async()=>{
    if(pairingCode.trim().length<4) return;
    setClaiming(true);
    setMessage("");
    try{
      const claimed=await claimPosDevice({
        pairingCode:pairingCode.trim(),
        transport:posClaimTransport,
      });
      setSession(claimed);
      setPairingCode("");
      await Promise.all([loadOrders(claimed,true),syncOutput(claimed)]);
    }catch(error){
      setMessage(error instanceof Error?error.message.replaceAll("_"," "):"Device activation failed.");
    }finally{
      setClaiming(false);
    }
  };

  const advance=async(order:PosActiveOnlineOrder)=>{
    if(!session) return;
    const next=NEXT_STATUS[order.status];
    if(!next) return;
    setBusyOrderId(order.id);
    setMessage("");
    try{
      await updatePosOnlineOrderStatus({
        deviceId:session.deviceId,
        credential:session.credential,
        onlineOrderId:order.id,
        status:next.status,
      });
      await loadOrders(session,true);
    }catch(error){
      setMessage(error instanceof Error?error.message.replaceAll("_"," "):"Unable to update order.");
    }finally{
      setBusyOrderId(null);
    }
  };

  if(loading){
    return(
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large"/>
          <Text style={styles.muted}>Loading ThePOSHaven…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if(!session){
    return(
      <SafeAreaView style={styles.safe}>
        <View style={styles.claimCard}>
          <Text style={styles.brand}>ThePOSHaven</Text>
          <Text style={styles.claimTitle}>Activate this register</Text>
          <Text style={styles.muted}>
            Enter the pairing code shown in Business → Hardware. This securely links this device to one location.
          </Text>
          <TextInput
            value={pairingCode}
            onChangeText={setPairingCode}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor="#6d6d73"
            maxLength={8}
            style={styles.codeInput}
          />
          <Pressable
            onPress={claim}
            disabled={claiming||pairingCode.trim().length<4}
            style={({pressed})=>[styles.primaryButton,(pressed||claiming)&&styles.buttonPressed]}
          >
            {claiming?<ActivityIndicator color="#fff"/>:<Text style={styles.primaryButtonText}>Activate register</Text>}
          </Pressable>
          {!!message&&<Text style={styles.error}>{message}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const counts={
    new:orders.filter(order=>order.status==="received").length,
    preparing:orders.filter(order=>order.status==="accepted"||order.status==="preparing").length,
    ready:orders.filter(order=>order.status==="ready").length,
  };

  if(workspaceMode==="tables"){
    return(
      <SafeAreaView style={styles.safe}>
        <View style={styles.modeHeader}>
          <View><Text style={styles.brand}>ThePOSHaven</Text><Text style={styles.modeLocation}>{session.locationName||"This location"} · {outputSummary}</Text></View>
          <View style={styles.modeSwitch}>
            <Pressable style={[styles.modeButton,styles.modeButtonActive]}><Text style={[styles.modeButtonText,styles.modeButtonTextActive]}>Tables</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("payments")} style={styles.modeButton}><Text style={styles.modeButtonText}>Payments</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("signature")} style={styles.modeButton}><Text style={styles.modeButtonText}>Signature+</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("online")} style={styles.modeButton}><Text style={styles.modeButtonText}>Online {counts.new?("· "+counts.new):""}</Text></Pressable>
          </View>
        </View>
        {!!message&&<Text style={styles.errorBanner}>{message}</Text>}
        <TableServiceWorkspace session={session}/>
      </SafeAreaView>
    );
  }


  if(workspaceMode==="payments"){
    return(
      <SafeAreaView style={styles.safe}>
        <View style={styles.modeHeader}>
          <View><Text style={styles.brand}>ThePOSHaven</Text><Text style={styles.modeLocation}>{session.locationName||"This location"} · {outputSummary}</Text></View>
          <View style={styles.modeSwitch}>
            <Pressable onPress={()=>setWorkspaceMode("tables")} style={styles.modeButton}><Text style={styles.modeButtonText}>Tables</Text></Pressable>
            <Pressable style={[styles.modeButton,styles.modeButtonActive]}><Text style={[styles.modeButtonText,styles.modeButtonTextActive]}>Payments</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("signature")} style={styles.modeButton}><Text style={styles.modeButtonText}>Signature+</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("online")} style={styles.modeButton}><Text style={styles.modeButtonText}>Online {counts.new?("· "+counts.new):""}</Text></Pressable>
          </View>
        </View>
        {!!message&&<Text style={styles.errorBanner}>{message}</Text>}
        <ManagerControlsWorkspace session={session} router={routerRef.current} refreshToken={posStateVersion}/>
      </SafeAreaView>
    );
  }

  if(workspaceMode==="signature"){
    return(
      <SafeAreaView style={styles.safe}>
        <View style={styles.modeHeader}>
          <View><Text style={styles.brand}>ThePOSHaven</Text><Text style={styles.modeLocation}>{session.locationName||"This location"} · {outputSummary}</Text></View>
          <View style={styles.modeSwitch}>
            <Pressable onPress={()=>setWorkspaceMode("tables")} style={styles.modeButton}><Text style={styles.modeButtonText}>Tables</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("payments")} style={styles.modeButton}><Text style={styles.modeButtonText}>Payments</Text></Pressable>
            <Pressable style={[styles.modeButton,styles.modeButtonActive]}><Text style={[styles.modeButtonText,styles.modeButtonTextActive]}>Signature+</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("online")} style={styles.modeButton}><Text style={styles.modeButtonText}>Online {counts.new?("· "+counts.new):""}</Text></Pressable>
          </View>
        </View>
        {!!message&&<Text style={styles.errorBanner}>{message}</Text>}
        <SignaturePlusWorkspace
          session={session}
          refreshToken={posStateVersion}
          onOpenCashDrawer={openCashDrawer}
          onPrintReceipt={printReceipt}
        />
      </SafeAreaView>
    );
  }

  return(
    <SafeAreaView style={styles.safe}>
      <View style={styles.modeHeader}>
        <View><Text style={styles.brand}>ThePOSHaven</Text><Text style={styles.modeLocation}>{session.locationName||"This location"} · {outputSummary}</Text></View>
        <View style={styles.modeSwitch}>
          <Pressable onPress={()=>setWorkspaceMode("tables")} style={styles.modeButton}><Text style={styles.modeButtonText}>Tables</Text></Pressable>
          <Pressable onPress={()=>setWorkspaceMode("payments")} style={styles.modeButton}><Text style={styles.modeButtonText}>Payments</Text></Pressable>
            <Pressable onPress={()=>setWorkspaceMode("signature")} style={styles.modeButton}><Text style={styles.modeButtonText}>Signature+</Text></Pressable>
          <Pressable style={[styles.modeButton,styles.modeButtonActive]}><Text style={[styles.modeButtonText,styles.modeButtonTextActive]}>Online {counts.new?("· "+counts.new):""}</Text></Pressable>
        </View>
      </View>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>ThePOSHaven</Text>
          <Text style={styles.title}>Online Orders</Text>
          <Text style={styles.location}>{session.locationName||"This location"} · {outputSummary}</Text>
        </View>
        <View style={styles.countRow}>
          <View style={styles.stat}><Text style={styles.statNumber}>{counts.new}</Text><Text style={styles.statLabel}>New</Text></View>
          <View style={styles.stat}><Text style={styles.statNumber}>{counts.preparing}</Text><Text style={styles.statLabel}>Working</Text></View>
          <View style={styles.stat}><Text style={styles.statNumber}>{counts.ready}</Text><Text style={styles.statLabel}>Ready</Text></View>
        </View>
      </View>

      {!!message&&<Text style={styles.errorBanner}>{message}</Text>}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>loadOrders(session)} tintColor="#fff"/>}
      >
        {!orders.length?(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No active online orders</Text>
            <Text style={styles.muted}>New paid website orders will appear here automatically.</Text>
          </View>
        ):orders.map(order=>{
          const next=NEXT_STATUS[order.status];
          return(
            <View key={order.id} style={[styles.orderCard,order.status==="received"&&styles.newOrderCard]}>
              <View style={styles.orderTop}>
                <View>
                  <Text style={styles.status}>{statusLabel(order.status)}</Text>
                  <Text style={styles.customer}>{order.customerName}</Text>
                  <Text style={styles.pickup}>Pickup {pickupLabel(order.promisedPickupAt)}</Text>
                </View>
                <View style={styles.amountBlock}>
                  <Text style={styles.total}>{money(order.amounts.totalCents)}</Text>
                  <Text style={styles.orderId}>#{order.id.slice(0,8).toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.lines}>
                {order.lines.map((line,index)=>(
                  <View key={`${order.id}-${index}`} style={styles.lineItem}>
                    <Text style={styles.qty}>{line.quantity}×</Text>
                    <View style={styles.lineText}>
                      <Text style={styles.itemName}>{line.name}</Text>
                      {line.modifiers.map((modifier:any,modifierIndex:number)=>(
                        <Text key={modifierIndex} style={styles.modifier}>+ {String(modifier?.name||modifier)}</Text>
                      ))}
                      {!!line.notes&&<Text style={styles.note}>Note: {line.notes}</Text>}
                    </View>
                  </View>
                ))}
              </View>

              {next&&(
                <Pressable
                  onPress={()=>advance(order)}
                  disabled={busyOrderId===order.id}
                  style={({pressed})=>[
                    styles.actionButton,
                    order.status==="ready"&&styles.completeButton,
                    (pressed||busyOrderId===order.id)&&styles.buttonPressed,
                  ]}
                >
                  {busyOrderId===order.id
                    ? <ActivityIndicator color="#fff"/>
                    : <Text style={styles.actionButtonText}>{next.label}</Text>}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#070303"},
  center:{flex:1,alignItems:"center",justifyContent:"center",gap:14,padding:24},
  modeHeader:{paddingHorizontal:16,paddingTop:10,paddingBottom:10,borderBottomWidth:1,borderBottomColor:"#202329",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},
  modeLocation:{color:"#8d878a",fontSize:10,fontWeight:"600",marginTop:2},
  modeSwitch:{flexDirection:"row",gap:6},
  modeButton:{borderRadius:11,borderWidth:1,borderColor:"#30343a",paddingHorizontal:13,paddingVertical:9,backgroundColor:"#101216"},
  modeButtonActive:{backgroundColor:"#d91d37",borderColor:"#ff5368"},
  modeButtonText:{color:"#a9a9ae",fontSize:11,fontWeight:"900"},
  modeButtonTextActive:{color:"#fff"},
  header:{paddingHorizontal:20,paddingTop:18,paddingBottom:14,borderBottomWidth:1,borderBottomColor:"#292326"},
  brand:{color:"#ff6b86",fontSize:11,fontWeight:"900",letterSpacing:2,textTransform:"uppercase"},
  title:{marginTop:4,color:"#fff",fontSize:30,fontWeight:"900"},
  location:{marginTop:5,color:"#9c9699",fontSize:12,fontWeight:"600"},
  countRow:{flexDirection:"row",gap:8,marginTop:14},
  stat:{flex:1,backgroundColor:"#121012",borderWidth:1,borderColor:"#2a2528",borderRadius:14,paddingVertical:9,paddingHorizontal:12},
  statNumber:{color:"#fff",fontSize:20,fontWeight:"900"},
  statLabel:{color:"#8d878a",fontSize:10,fontWeight:"800",textTransform:"uppercase",letterSpacing:1},
  list:{padding:16,paddingBottom:80,gap:14},
  empty:{marginTop:50,alignItems:"center",padding:24},
  emptyTitle:{color:"#fff",fontSize:21,fontWeight:"900",marginBottom:8},
  muted:{color:"#9c9699",fontSize:14,lineHeight:21},
  orderCard:{backgroundColor:"#121012",borderWidth:1,borderColor:"#2b2629",borderRadius:20,padding:18},
  newOrderCard:{borderColor:"#ff6b86"},
  orderTop:{flexDirection:"row",justifyContent:"space-between",gap:16},
  status:{color:"#ff6b86",fontSize:10,fontWeight:"900",letterSpacing:1.5},
  customer:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:5},
  pickup:{color:"#c3bdc0",fontSize:14,fontWeight:"700",marginTop:3},
  amountBlock:{alignItems:"flex-end"},
  total:{color:"#fff",fontSize:20,fontWeight:"900"},
  orderId:{color:"#7f797c",fontSize:10,fontWeight:"800",marginTop:3},
  lines:{marginTop:16,paddingTop:13,borderTopWidth:1,borderTopColor:"#292326",gap:10},
  lineItem:{flexDirection:"row",gap:10},
  qty:{color:"#ff6b86",fontWeight:"900",fontSize:16,minWidth:28},
  lineText:{flex:1},
  itemName:{color:"#fff",fontSize:16,fontWeight:"800"},
  modifier:{color:"#aaa3a6",fontSize:13,marginTop:2},
  note:{color:"#f2c35f",fontSize:13,fontWeight:"700",marginTop:4},
  actionButton:{marginTop:18,minHeight:50,borderRadius:14,backgroundColor:"#d62f45",alignItems:"center",justifyContent:"center"},
  completeButton:{backgroundColor:"#237a4b"},
  actionButtonText:{color:"#fff",fontSize:15,fontWeight:"900"},
  buttonPressed:{opacity:.65},
  errorBanner:{marginHorizontal:16,marginTop:10,padding:12,borderRadius:12,backgroundColor:"#3c171b",color:"#ffb7c0",fontSize:12,fontWeight:"700"},
  claimCard:{margin:24,marginTop:"auto",marginBottom:"auto",borderRadius:24,borderWidth:1,borderColor:"#2a2528",backgroundColor:"#111011",padding:24},
  claimTitle:{color:"#fff",fontSize:30,fontWeight:"900",marginTop:8,marginBottom:10},
  codeInput:{marginTop:20,borderRadius:14,borderWidth:1,borderColor:"#373137",backgroundColor:"#080708",color:"#fff",fontSize:26,fontWeight:"900",letterSpacing:7,textAlign:"center",paddingVertical:16},
  primaryButton:{marginTop:14,minHeight:52,borderRadius:14,backgroundColor:"#d62f45",alignItems:"center",justifyContent:"center"},
  primaryButtonText:{color:"#fff",fontSize:15,fontWeight:"900"},
  error:{marginTop:12,color:"#ff9ead",fontSize:13,fontWeight:"700"},
});
