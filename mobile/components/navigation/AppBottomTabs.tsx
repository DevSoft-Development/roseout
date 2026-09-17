import { Pressable, StyleSheet, View, type ColorValue } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type IconName = "home" | "discover" | "outings" | "profile";

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const stroke = color;
  const weight = focused ? 2.6 : 2.2;
  if (name === "home") return <View style={styles.iconBox}><View style={[styles.homeRoof,{borderColor:stroke,borderLeftWidth:weight,borderTopWidth:weight}]} /><View style={[styles.homeBody,{borderColor:stroke,borderWidth:weight,borderTopWidth:0,backgroundColor:focused?"rgba(225, 6, 42, 0.08)":"transparent"}]} /></View>;
  if (name === "discover") return <View style={styles.iconBox}><View style={[styles.compass,{borderColor:stroke,borderWidth:weight}]}><View style={[styles.compassNeedle,{backgroundColor:stroke}]} /><View style={[styles.compassDot,{backgroundColor:focused?stroke:"transparent",borderWidth:focused?0:1.8,borderColor:stroke}]} /></View></View>;
  if (name === "outings") return <View style={styles.iconBox}><View style={[styles.calendar,{borderColor:stroke,borderWidth:weight,backgroundColor:focused?"rgba(225, 6, 42, 0.08)":"transparent"}]}><View style={[styles.calendarLine,{height:weight,backgroundColor:stroke}]} /><View style={[styles.calendarPinLeft,{width:weight,backgroundColor:stroke}]} /><View style={[styles.calendarPinRight,{width:weight,backgroundColor:stroke}]} /><View style={[styles.calendarDotLeft,{backgroundColor:stroke}]} /><View style={[styles.calendarDotRight,{backgroundColor:stroke}]} /></View></View>;
  return <View style={styles.iconBox}><View style={[styles.profileHead,{borderWidth:weight,borderColor:stroke,backgroundColor:focused?stroke:"transparent"}]} /><View style={[styles.profileBody,{borderWidth:weight,borderBottomWidth:0,borderColor:stroke}]} /></View>;
}

const tabs = [
  { key: "home", label: "Home", href: "/(tabs)", active: (p: string) => p === "/" || p === "/(tabs)" || p === "/(tabs)/" },
  { key: "discover", label: "Discover", href: "/(tabs)/explore", active: (p: string) => p.includes("explore") || p.includes("search") || p.includes("results") || p.includes("location") },
  { key: "outings", label: "Outings", href: "/(tabs)/outings", active: (p: string) => p.includes("outings") || p.includes("outing/") || p.includes("complete") || p.includes("plan") },
  { key: "profile", label: "Profile", href: "/(tabs)/profile", active: (p: string) => p.includes("profile") || p.includes("auth") },
] as const;

export function AppBottomTabs() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar,{backgroundColor:"rgba(13,13,13,0.98)",borderTopColor:theme.colors.borderStrong,paddingBottom:Math.max(insets.bottom,10)}]}>
      {tabs.map((tab) => {
        const focused = tab.active(pathname);
        const color = focused ? theme.colors.accent : theme.colors.textMuted;
        return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{selected:focused}} onPress={() => router.replace(tab.href)} style={styles.item}>
          <TabIcon name={tab.key} color={color} focused={focused} />
          <AppText style={[styles.label,{color}]}>{tab.label}</AppText>
        </Pressable>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar:{flexDirection:"row",borderTopWidth:1,paddingTop:8,minHeight:80,shadowColor:"#000000",shadowOpacity:0.36,shadowRadius:22,shadowOffset:{width:0,height:-8},elevation:18},
  item:{flex:1,alignItems:"center",justifyContent:"center",gap:3,minHeight:58},label:{fontSize:11,fontWeight:"800",letterSpacing:0.1},iconBox:{width:26,height:26,alignItems:"center",justifyContent:"center"},
  homeRoof:{position:"absolute",top:4,width:15,height:15,transform:[{rotate:"45deg"}],borderTopLeftRadius:2},homeBody:{position:"absolute",bottom:3,width:17,height:14,borderBottomLeftRadius:3,borderBottomRightRadius:3},
  compass:{width:22,height:22,borderRadius:11,alignItems:"center",justifyContent:"center"},compassNeedle:{width:4,height:13,borderRadius:2,transform:[{rotate:"38deg"}]},compassDot:{position:"absolute",width:5,height:5,borderRadius:3},
  calendar:{width:21,height:20,borderRadius:5,marginTop:2},calendarLine:{position:"absolute",top:5,left:0,right:0},calendarPinLeft:{position:"absolute",top:-4,left:4,height:7,borderRadius:2},calendarPinRight:{position:"absolute",top:-4,right:4,height:7,borderRadius:2},calendarDotLeft:{position:"absolute",bottom:3.5,left:5,width:3.5,height:3.5,borderRadius:2},calendarDotRight:{position:"absolute",bottom:3.5,right:5,width:3.5,height:3.5,borderRadius:2},
  profileHead:{position:"absolute",top:3,width:9,height:9,borderRadius:5},profileBody:{position:"absolute",bottom:2,width:20,height:11,borderTopLeftRadius:11,borderTopRightRadius:11},
});
