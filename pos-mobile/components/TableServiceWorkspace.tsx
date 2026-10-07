import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { PosClaimSession } from "@/lib/device/identity";
import {
  addPosTableItem,
  fetchPosTableService,
  fetchPosTableWorkspace,
  openPosTableCheck,
  sendPosTableCourses,
  updatePosTableGuestCount,
  type PosTableCatalogItem,
  type PosTableSummary,
  type PosTableWorkspace,
} from "@/lib/device/cloud";

const COURSES=[
  ["all","All"],["drinks","Drinks"],["appetizers","Apps"],["entrees","Entrées"],["desserts","Desserts"],
] as const;

function money(cents:number){return "$"+(Number(cents||0)/100).toFixed(2);}
function readable(value:string){return value.replace(/_/g," ").replace(/w/g,m=>m.toUpperCase());}

function GuestPill({label,selected,onPress,compact=false}:{label:string;selected:boolean;onPress:()=>void;compact?:boolean}){
  return <Pressable onPress={onPress} style={[styles.guestPill,compact&&styles.guestPillCompact,selected&&styles.guestPillActive]}>
    <Text style={[styles.guestPillText,selected&&styles.guestPillTextActive]}>{label}</Text>
  </Pressable>;
}

export default function TableServiceWorkspace({session}:{session:PosClaimSession}){
  const {width}=useWindowDimensions();
  const tablet=width>=900;
  const [tables,setTables]=useState<PosTableSummary[]>([]);
  const [catalog,setCatalog]=useState<{sections:{id:string;name:string;sortOrder:number}[];items:PosTableCatalogItem[]}|null>(null);
  const [workspace,setWorkspace]=useState<PosTableWorkspace|null>(null);
  const [selectedTable,setSelectedTable]=useState<PosTableSummary|null>(null);
  const [selectedGuests,setSelectedGuests]=useState<number[]>([1]);
  const [shared,setShared]=useState(false);
  const [multiSelect,setMultiSelect]=useState(false);
  const [course,setCourse]=useState("all");
  const [sectionId,setSectionId]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [overview,setOverview]=useState(false);
  const [modifierItem,setModifierItem]=useState<PosTableCatalogItem|null>(null);
  const [modifierIds,setModifierIds]=useState<string[]>([]);

  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const data=await fetchPosTableService({deviceId:session.deviceId,credential:session.credential});
      setTables(data.tables);setCatalog(data.catalog);
      if(!sectionId&&data.catalog?.sections?.length) setSectionId(data.catalog.sections[0].id);
      if(workspace) setWorkspace(await fetchPosTableWorkspace({deviceId:session.deviceId,credential:session.credential,checkId:workspace.id}));
    }catch(e){setError(e instanceof Error?readable(e.message):"Unable to load tables.");}
    finally{setLoading(false)}
  },[session,workspace?.id]);

  useEffect(()=>{void refresh()},[session.deviceId]);

  const openTable=async(table:PosTableSummary)=>{
    setBusy(true);setError("");
    try{
      const next=await openPosTableCheck({
        deviceId:session.deviceId,credential:session.credential,layoutItemId:table.id,
        guestCount:table.reservation?.partySize||table.capacity||1,
      });
      setSelectedTable(table);setWorkspace(next);setSelectedGuests([1]);setShared(false);setOverview(false);
    }catch(e){setError(e instanceof Error?readable(e.message):"Unable to open table.");}
    finally{setBusy(false)}
  };

  const chooseGuest=(seat:number)=>{
    setShared(false);
    if(!multiSelect){setSelectedGuests([seat]);return;}
    setSelectedGuests(current=>current.includes(seat)?current.filter(value=>value!==seat):[...current,seat].sort((a,b)=>a-b));
  };
  const chooseShared=()=>{setShared(true);setSelectedGuests([]);};

  const filteredItems=useMemo(()=>{
    const query=search.trim().toLowerCase();
    return (catalog?.items||[]).filter(item=>{
      if(course!=="all"&&item.course!==course) return false;
      if(sectionId&&!query&&course==="all"&&item.sectionId!==sectionId) return false;
      if(query&&!((item.name+" "+item.fullName+" "+(item.description||"")).toLowerCase().includes(query))) return false;
      return true;
    });
  },[catalog,course,sectionId,search]);

  const addItem=async(item:PosTableCatalogItem,selectedModifiers:string[]=[] )=>{
    if(!workspace||(!shared&&!selectedGuests.length)) return;
    setBusy(true);setError("");
    try{
      const next=await addPosTableItem({
        deviceId:session.deviceId,credential:session.credential,checkId:workspace.id,
        catalogItemId:item.id,seatNumbers:shared?null:selectedGuests,course:item.course,
        modifierIds:selectedModifiers,
      });
      setWorkspace(next);setModifierItem(null);setModifierIds([]);
      if(!multiSelect&&!shared&&selectedGuests.length===1) setSelectedGuests(selectedGuests);
    }catch(e){setError(e instanceof Error?readable(e.message):"Unable to add item.");}
    finally{setBusy(false)}
  };

  const tapItem=(item:PosTableCatalogItem)=>{
    if(!item.isAvailable) return;
    if(item.modifiers.length){setModifierItem(item);setModifierIds([]);return;}
    void addItem(item);
  };

  const toggleModifier=(id:string,max:number|null)=>{
    setModifierIds(current=>{
      if(current.includes(id)) return current.filter(value=>value!==id);
      if(max===1) return [id];
      return [...current,id];
    });
  };

  const sendCourses=async(courses?:string[])=>{
    if(!workspace) return;
    setBusy(true);setError("");
    try{
      setWorkspace(await sendPosTableCourses({
        deviceId:session.deviceId,credential:session.credential,checkId:workspace.id,courses:courses||null,
      }));
    }catch(e){setError(e instanceof Error?readable(e.message):"Unable to send order.");}
    finally{setBusy(false)}
  };

  const addGuest=async()=>{
    if(!workspace) return;
    setBusy(true);
    try{
      const next=await updatePosTableGuestCount({
        deviceId:session.deviceId,credential:session.credential,checkId:workspace.id,guestCount:workspace.guestCount+1,
      });
      setWorkspace(next);
    }catch(e){setError(e instanceof Error?readable(e.message):"Unable to add guest.");}
    finally{setBusy(false)}
  };

  if(loading&&!catalog) return <View style={styles.center}><ActivityIndicator/><Text style={styles.muted}>Loading tables…</Text></View>;

  if(!workspace){
    return <ScrollView contentContainerStyle={styles.tablePicker}>
      <View style={styles.pageHeading}>
        <View><Text style={styles.eyebrow}>Table Service</Text><Text style={styles.title}>Choose a table</Text><Text style={styles.muted}>Reservations automatically supply the guest count when a table is assigned.</Text></View>
      </View>
      {!!error&&<Text style={styles.error}>{error}</Text>}
      <View style={styles.tableGrid}>
        {tables.map(table=><Pressable key={table.id} onPress={()=>openTable(table)} disabled={busy} style={[styles.tableCard,table.openCheck&&styles.tableCardOpen]}>
          <View style={styles.rowBetween}><Text style={styles.tableName}>{table.label}</Text><Text style={styles.tableStatus}>{table.openCheck?"OPEN":table.reservation?"RESERVED":"AVAILABLE"}</Text></View>
          {table.reservation?<><Text style={styles.reservationName}>{table.reservation.customerName}</Text><Text style={styles.muted}>{table.reservation.partySize} guests · {table.reservation.time}</Text></>:<Text style={styles.muted}>Capacity {table.capacity}</Text>}
          {table.openCheck&&<Text style={styles.openCheck}>Open check · {money(table.openCheck.totalCents)}</Text>}
        </Pressable>)}
      </View>
      {!tables.length&&<View style={styles.empty}><Text style={styles.emptyTitle}>No tables configured</Text><Text style={styles.muted}>Add active dining tables in the reservation floor layout.</Text></View>}
    </ScrollView>;
  }

  const guestNumbers=Array.from({length:workspace.guestCount},(_,index)=>index+1);
  const groups=guestNumbers.map(seat=>({
    seat,label:"Guest "+seat,items:workspace.items.filter(item=>item.seatNumber===seat),
  }));
  const sharedItems=workspace.items.filter(item=>item.shared);
  const unsentCourses=Array.from(new Set(workspace.items.filter(item=>item.status==="active").map(item=>item.course)));

  const guestBar=<View style={styles.guestBar}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.guestScroll}>
      {guestNumbers.map(seat=><GuestPill key={seat} compact={!tablet} label={"G"+seat} selected={!shared&&selectedGuests.includes(seat)} onPress={()=>chooseGuest(seat)}/>)}
      <GuestPill compact={!tablet} label="Shared" selected={shared} onPress={chooseShared}/>
    </ScrollView>
    <Pressable onPress={()=>setOverview(!overview)} style={styles.smallButton}><Text style={styles.smallButtonText}>{overview?"Close":"Overview"}</Text></Pressable>
  </View>;

  const courseBar=<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseBar}>
    {COURSES.map(([key,label])=><Pressable key={key} onPress={()=>setCourse(key)} style={[styles.coursePill,course===key&&styles.coursePillActive]}><Text style={[styles.courseText,course===key&&styles.courseTextActive]}>{label}</Text></Pressable>)}
  </ScrollView>;

  const orderSummary=<View style={styles.summaryPanel}>
    <View style={styles.rowBetween}><View><Text style={styles.eyebrow}>Table order</Text><Text style={styles.summaryTitle}>{selectedTable?.label||workspace.resources?.[0]?.resource_label||"Table"}</Text></View><Text style={styles.total}>{money(workspace.amounts.totalCents)}</Text></View>
    <Text style={styles.muted}>{workspace.reservation?workspace.reservation.customerName+" · ":""}{workspace.guestCount} guests</Text>
    <ScrollView style={tablet?styles.summaryScroll:undefined} nestedScrollEnabled>
      {groups.map(group=><View key={group.seat} style={styles.guestGroup}>
        <View style={styles.rowBetween}><Text style={styles.guestHeading}>{group.label}</Text><Text style={styles.groupMeta}>{group.items.length} items · {money(group.items.reduce((s,i)=>s+i.lineTotalCents,0))}</Text></View>
        {group.items.map(item=><View key={item.id} style={styles.summaryItem}><View style={styles.summaryItemMain}><Text style={styles.itemName}>{item.quantity}× {item.name}</Text><Text style={styles.itemMeta}>{readable(item.course)} · {item.status==="active"?"Not sent":readable(item.status)}</Text></View><Text style={styles.itemPrice}>{money(item.lineTotalCents)}</Text></View>)}
      </View>)}
      {!!sharedItems.length&&<View style={styles.guestGroup}><View style={styles.rowBetween}><Text style={styles.guestHeading}>Shared</Text><Text style={styles.groupMeta}>{sharedItems.length} items</Text></View>{sharedItems.map(item=><View key={item.id} style={styles.summaryItem}><View style={styles.summaryItemMain}><Text style={styles.itemName}>{item.quantity}× {item.name}</Text><Text style={styles.itemMeta}>{readable(item.course)} · {item.status==="active"?"Not sent":readable(item.status)}</Text></View><Text style={styles.itemPrice}>{money(item.lineTotalCents)}</Text></View>)}</View>}
    </ScrollView>
    <View style={styles.sendGrid}>
      {unsentCourses.includes("drinks")&&<Pressable onPress={()=>sendCourses(["drinks"])} style={styles.sendButton}><Text style={styles.sendText}>Send Drinks</Text></Pressable>}
      {unsentCourses.includes("appetizers")&&<Pressable onPress={()=>sendCourses(["appetizers"])} style={styles.sendButton}><Text style={styles.sendText}>Send Apps</Text></Pressable>}
      {unsentCourses.includes("entrees")&&<Pressable onPress={()=>sendCourses(["entrees"])} style={styles.sendButton}><Text style={styles.sendText}>Send Entrées</Text></Pressable>}
      {!!unsentCourses.length&&<Pressable onPress={()=>sendCourses()} style={[styles.sendButton,styles.sendAll]}><Text style={styles.sendText}>Send All Ready</Text></Pressable>}
    </View>
  </View>;

  const menu=<View style={styles.menuPanel}>
    <View style={styles.tableHeader}>
      <View><Text style={styles.eyebrow}>{selectedTable?.label||"Table Service"}</Text><Text style={styles.title}>{workspace.reservation?.customerName||"Table Order"}</Text><Text style={styles.muted}>{workspace.guestCount} guests{workspace.reservation?" · "+workspace.reservation.time:""}</Text></View>
      <Pressable onPress={()=>{setWorkspace(null);setSelectedTable(null)}} style={styles.smallButton}><Text style={styles.smallButtonText}>Tables</Text></Pressable>
    </View>
    {guestBar}
    <View style={styles.toolsRow}>
      <Pressable onPress={()=>setMultiSelect(!multiSelect)} style={[styles.toolButton,multiSelect&&styles.toolButtonActive]}><Text style={styles.toolText}>{multiSelect?"Multi-select On":"Multi-select Guests"}</Text></Pressable>
      <Pressable onPress={addGuest} style={styles.toolButton}><Text style={styles.toolText}>+ Guest</Text></Pressable>
      <Text style={styles.selectionLabel}>{shared?"Adding to Shared":selectedGuests.length>1?"Adding to "+selectedGuests.length+" guests":"Adding to Guest "+(selectedGuests[0]||1)}</Text>
    </View>
    {courseBar}
    <TextInput value={search} onChangeText={setSearch} placeholder="Search menu…" placeholderTextColor="#756f73" style={styles.search}/>
    {course==="all"&&!search&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionBar}>{catalog?.sections.map(section=><Pressable key={section.id} onPress={()=>setSectionId(section.id)} style={[styles.sectionPill,sectionId===section.id&&styles.sectionPillActive]}><Text style={styles.sectionText}>{section.name}</Text></Pressable>)}</ScrollView>}
    <ScrollView contentContainerStyle={styles.itemGrid} nestedScrollEnabled>
      {filteredItems.map(item=><Pressable key={item.id} onPress={()=>tapItem(item)} disabled={!item.isAvailable||busy} style={[styles.itemCard,!item.isAvailable&&styles.itemUnavailable,tablet&&styles.itemCardTablet]}>
        <View style={styles.rowBetween}><Text style={styles.itemCardName}>{item.name}</Text><Text style={styles.itemCardPrice}>{money(item.priceCents)}</Text></View>
        <Text numberOfLines={2} style={styles.itemDescription}>{item.description||readable(item.course)}</Text>
        <View style={styles.rowBetween}><Text style={styles.itemCourse}>{readable(item.course)}</Text><Text style={item.isAvailable?styles.addText:styles.soldOut}>{item.isAvailable?"+ Add":"Sold out"}</Text></View>
      </Pressable>)}
    </ScrollView>
  </View>;

  const overviewPanel=overview?<View style={styles.overviewPanel}><View style={styles.rowBetween}><Text style={styles.summaryTitle}>Guest Overview</Text><Text style={styles.muted}>{workspace.guestCount} guests</Text></View><View style={styles.overviewGrid}>{groups.map(group=><Pressable key={group.seat} onPress={()=>{setSelectedGuests([group.seat]);setShared(false);setOverview(false)}} style={styles.overviewGuest}><Text style={styles.guestHeading}>Guest {group.seat}</Text><Text style={styles.groupMeta}>{group.items.length} items · {money(group.items.reduce((s,i)=>s+i.lineTotalCents,0))}</Text></Pressable>)}<Pressable onPress={()=>{chooseShared();setOverview(false)}} style={styles.overviewGuest}><Text style={styles.guestHeading}>Shared</Text><Text style={styles.groupMeta}>{sharedItems.length} items</Text></Pressable></View></View>:null;

  return <View style={styles.workspace}>
    {!!error&&<Text style={styles.error}>{error}</Text>}
    {overviewPanel}
    {tablet?<View style={styles.tabletLayout}><View style={styles.categoriesRail}><Text style={styles.railTitle}>Menu</Text>{catalog?.sections.map(section=><Pressable key={section.id} onPress={()=>{setSectionId(section.id);setCourse("all");setSearch("")}} style={[styles.railButton,sectionId===section.id&&course==="all"&&styles.railButtonActive]}><Text style={styles.railText}>{section.name}</Text></Pressable>)}</View><View style={styles.tabletMenu}>{menu}</View><View style={styles.tabletSummary}>{orderSummary}</View></View>:<ScrollView contentContainerStyle={styles.handheldContent}>{menu}{orderSummary}</ScrollView>}
    {modifierItem&&<View style={styles.modalBackdrop}><View style={styles.modifierSheet}><View style={styles.rowBetween}><View><Text style={styles.eyebrow}>Customize</Text><Text style={styles.modifierTitle}>{modifierItem.name}</Text></View><Pressable onPress={()=>{setModifierItem(null);setModifierIds([])}} style={styles.smallButton}><Text style={styles.smallButtonText}>Close</Text></Pressable></View>
      <ScrollView style={styles.modifierScroll}>{modifierItem.modifiers.map(group=><View key={group.id} style={styles.modifierGroup}><Text style={styles.guestHeading}>{group.name}{group.required?" · Required":""}</Text>{group.modifiers.map(modifier=><Pressable key={modifier.id} onPress={()=>toggleModifier(modifier.id,group.maxSelect)} style={[styles.modifierOption,modifierIds.includes(modifier.id)&&styles.modifierOptionActive]}><Text style={styles.itemName}>{modifier.name}</Text><Text style={styles.itemPrice}>{modifier.priceDeltaCents?"+ "+money(modifier.priceDeltaCents):""}</Text></Pressable>)}</View>)}</ScrollView>
      <Pressable onPress={()=>addItem(modifierItem,modifierIds)} disabled={busy} style={styles.primaryButton}><Text style={styles.primaryText}>Add to {shared?"Shared":selectedGuests.length>1?selectedGuests.length+" Guests":"Guest "+(selectedGuests[0]||1)} · {money(modifierItem.priceCents)}</Text></Pressable>
    </View></View>}
  </View>;
}

const styles=StyleSheet.create({
  center:{flex:1,alignItems:"center",justifyContent:"center",gap:12,padding:24,backgroundColor:"#07080a"},
  workspace:{flex:1,backgroundColor:"#07080a"},handheldContent:{paddingBottom:80},
  pageHeading:{paddingBottom:8},eyebrow:{color:"#ff5b70",fontSize:10,fontWeight:"900",letterSpacing:1.5,textTransform:"uppercase"},
  title:{color:"#fff",fontSize:28,fontWeight:"900",marginTop:3},muted:{color:"#928d91",fontSize:12,fontWeight:"600",marginTop:3},
  error:{margin:12,padding:10,borderRadius:10,backgroundColor:"#3a151a",color:"#ffb2bd",fontSize:12,fontWeight:"700"},
  tablePicker:{padding:16,paddingBottom:80,backgroundColor:"#07080a",minHeight:"100%"},tableGrid:{flexDirection:"row",flexWrap:"wrap",gap:12,marginTop:14},
  tableCard:{minWidth:160,flexGrow:1,flexBasis:180,borderRadius:18,borderWidth:1,borderColor:"#282b31",backgroundColor:"#111318",padding:16},
  tableCardOpen:{borderColor:"#ff4058"},rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
  tableName:{color:"#fff",fontSize:20,fontWeight:"900"},tableStatus:{color:"#ff6b7d",fontSize:9,fontWeight:"900",letterSpacing:1},
  reservationName:{color:"#fff",fontSize:15,fontWeight:"800",marginTop:14},openCheck:{color:"#8fd2a6",fontSize:12,fontWeight:"800",marginTop:10},
  empty:{padding:30,alignItems:"center"},emptyTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginBottom:8},
  tabletLayout:{flex:1,flexDirection:"row"},categoriesRail:{width:180,borderRightWidth:1,borderRightColor:"#202329",padding:12,gap:6},
  railTitle:{color:"#777b84",fontSize:10,fontWeight:"900",letterSpacing:1.4,textTransform:"uppercase",padding:8},
  railButton:{paddingHorizontal:12,paddingVertical:13,borderRadius:12},railButtonActive:{backgroundColor:"#251217"},
  railText:{color:"#e8e8ea",fontSize:13,fontWeight:"800"},tabletMenu:{flex:1,minWidth:0},tabletSummary:{width:350,borderLeftWidth:1,borderLeftColor:"#202329"},
  menuPanel:{padding:14,gap:10},tableHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"},
  guestBar:{flexDirection:"row",alignItems:"center",gap:8},guestScroll:{gap:7,paddingRight:8},
  guestPill:{minWidth:58,minHeight:50,borderRadius:14,borderWidth:1,borderColor:"#30343b",backgroundColor:"#12151a",alignItems:"center",justifyContent:"center",paddingHorizontal:10},
  guestPillCompact:{minWidth:52,minHeight:46},guestPillActive:{backgroundColor:"#d91d37",borderColor:"#ff5368"},
  guestPillText:{color:"#c9c9cc",fontSize:12,fontWeight:"900"},guestPillTextActive:{color:"#fff"},
  smallButton:{borderRadius:11,borderWidth:1,borderColor:"#343840",backgroundColor:"#14171c",paddingHorizontal:12,paddingVertical:10},
  smallButtonText:{color:"#e7e7e9",fontSize:11,fontWeight:"900"},toolsRow:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},
  toolButton:{borderRadius:10,borderWidth:1,borderColor:"#30343b",paddingHorizontal:10,paddingVertical:8},toolButtonActive:{borderColor:"#ff5368",backgroundColor:"#2e1118"},
  toolText:{color:"#ddd",fontSize:10,fontWeight:"900"},selectionLabel:{color:"#ff8897",fontSize:10,fontWeight:"800"},
  courseBar:{gap:7},coursePill:{borderRadius:10,borderWidth:1,borderColor:"#282c32",backgroundColor:"#12151a",paddingHorizontal:13,paddingVertical:9},
  coursePillActive:{backgroundColor:"#d91d37",borderColor:"#ff5368"},courseText:{color:"#a8a8ad",fontSize:11,fontWeight:"800"},courseTextActive:{color:"#fff"},
  search:{borderRadius:12,borderWidth:1,borderColor:"#292d34",backgroundColor:"#0e1014",color:"#fff",fontSize:14,paddingHorizontal:13,paddingVertical:11},
  sectionBar:{gap:7},sectionPill:{borderRadius:10,backgroundColor:"#15181e",paddingHorizontal:11,paddingVertical:8},sectionPillActive:{backgroundColor:"#2a171c"},
  sectionText:{color:"#d5d5d8",fontSize:10,fontWeight:"800"},itemGrid:{flexDirection:"row",flexWrap:"wrap",gap:9,paddingBottom:20},
  itemCard:{width:"48%",minHeight:112,borderRadius:15,borderWidth:1,borderColor:"#292d34",backgroundColor:"#11141a",padding:12,justifyContent:"space-between"},
  itemCardTablet:{minWidth:175,maxWidth:240,flexGrow:1},itemUnavailable:{opacity:.42},itemCardName:{color:"#fff",fontSize:14,fontWeight:"900",flex:1},
  itemCardPrice:{color:"#fff",fontSize:13,fontWeight:"900"},itemDescription:{color:"#7f8188",fontSize:10,lineHeight:14,marginVertical:7},
  itemCourse:{color:"#8f9299",fontSize:9,fontWeight:"800",textTransform:"uppercase"},addText:{color:"#ff6477",fontSize:11,fontWeight:"900"},soldOut:{color:"#bd7a82",fontSize:10,fontWeight:"900"},
  summaryPanel:{padding:14,borderTopWidth:1,borderTopColor:"#202329",backgroundColor:"#0c0e12"},summaryTitle:{color:"#fff",fontSize:21,fontWeight:"900"},
  total:{color:"#fff",fontSize:23,fontWeight:"900"},summaryScroll:{maxHeight:520},guestGroup:{marginTop:13,paddingTop:11,borderTopWidth:1,borderTopColor:"#20242a"},
  guestHeading:{color:"#fff",fontSize:13,fontWeight:"900"},groupMeta:{color:"#7f828a",fontSize:10,fontWeight:"700"},summaryItem:{flexDirection:"row",gap:8,paddingVertical:7},
  summaryItemMain:{flex:1},itemName:{color:"#ececef",fontSize:12,fontWeight:"800"},itemMeta:{color:"#858890",fontSize:9,fontWeight:"700",marginTop:2},itemPrice:{color:"#d9d9dc",fontSize:11,fontWeight:"900"},
  sendGrid:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:14},sendButton:{flexGrow:1,minWidth:100,borderRadius:11,backgroundColor:"#b91d33",paddingHorizontal:10,paddingVertical:12,alignItems:"center"},
  sendAll:{backgroundColor:"#253143"},sendText:{color:"#fff",fontSize:10,fontWeight:"900"},overviewPanel:{margin:12,borderRadius:18,borderWidth:1,borderColor:"#343841",backgroundColor:"#101319",padding:14},
  overviewGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:12},overviewGuest:{minWidth:120,flexGrow:1,borderRadius:12,backgroundColor:"#171a20",padding:12},
  modalBackdrop:{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,.72)",alignItems:"center",justifyContent:"center",padding:16},
  modifierSheet:{width:"100%",maxWidth:620,maxHeight:"88%",borderRadius:24,borderWidth:1,borderColor:"#353941",backgroundColor:"#0c0f13",padding:18},
  modifierTitle:{color:"#fff",fontSize:26,fontWeight:"900",marginTop:3},modifierScroll:{marginTop:12},modifierGroup:{marginBottom:16,gap:7},
  modifierOption:{flexDirection:"row",justifyContent:"space-between",borderRadius:12,borderWidth:1,borderColor:"#2d3138",backgroundColor:"#14171c",padding:12},
  modifierOptionActive:{borderColor:"#ff4d63",backgroundColor:"#2c1218"},primaryButton:{marginTop:12,borderRadius:14,backgroundColor:"#e51f3b",padding:15,alignItems:"center"},
  primaryText:{color:"#fff",fontSize:14,fontWeight:"900"},
});
