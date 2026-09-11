import { Text, View, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { useAppTheme } from "@/providers/ThemeProvider";

function TabGlyph({ glyph, color, focused }: { glyph: string; color: ColorValue; focused: boolean }) {
  return (
    <View
      style={{
        minWidth: 34,
        height: 28,
        paddingHorizontal: 9,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? "rgba(225, 6, 42, 0.14)" : "transparent",
      }}
    >
      <Text style={{ color, fontSize: 19, lineHeight: 22, fontWeight: focused ? "900" : "700" }}>{glyph}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.1, marginTop: 1 },
        tabBarItemStyle: { paddingTop: 5 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(13,13,13,0.98)",
          borderTopColor: theme.colors.borderStrong,
          borderTopWidth: 1,
          height: 78,
          paddingTop: 6,
          paddingBottom: 12,
          shadowColor: "#000000",
          shadowOpacity: 0.36,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: -8 },
          elevation: 18,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, focused }) => <TabGlyph glyph="⌂" color={color} focused={focused} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color, focused }) => <TabGlyph glyph="⌕" color={color} focused={focused} /> }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: ({ color, focused }) => <TabGlyph glyph="✦" color={color} focused={focused} /> }} />
      <Tabs.Screen name="outings" options={{ title: "Outings", tabBarIcon: ({ color, focused }) => <TabGlyph glyph="♡" color={color} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <TabGlyph glyph="◉" color={color} focused={focused} /> }} />
      <Tabs.Screen name="results" options={{ href: null }} />
      <Tabs.Screen name="complete" options={{ href: null }} />
    </Tabs>
  );
}
