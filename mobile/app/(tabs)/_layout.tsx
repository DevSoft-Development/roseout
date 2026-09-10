import { Text } from "react-native";
import { Tabs } from "expo-router";
import { useAppTheme } from "@/providers/ThemeProvider";

function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 19, lineHeight: 22 }}>{glyph}</Text>;
}

export default function TabLayout() {
  const { theme } = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color }) => <TabGlyph glyph="⌕" color={color} /> }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: ({ color }) => <TabGlyph glyph="✦" color={color} /> }} />
      <Tabs.Screen name="outings" options={{ title: "Outings", tabBarIcon: ({ color }) => <TabGlyph glyph="♡" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <TabGlyph glyph="◉" color={color} /> }} />
      <Tabs.Screen name="results" options={{ href: null }} />
      <Tabs.Screen name="complete" options={{ href: null }} />
    </Tabs>
  );
}
