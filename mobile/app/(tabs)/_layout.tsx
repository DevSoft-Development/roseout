import { View, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { useAppTheme } from "@/providers/ThemeProvider";

type IconName = "home" | "discover" | "outings" | "profile";

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const stroke = color;
  const weight = focused ? 2.6 : 2.2;

  if (name === "home") {
    return (
      <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            position: "absolute",
            top: 4,
            width: 15,
            height: 15,
            borderLeftWidth: weight,
            borderTopWidth: weight,
            borderColor: stroke,
            transform: [{ rotate: "45deg" }],
            borderTopLeftRadius: 2,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 3,
            width: 17,
            height: 14,
            borderWidth: weight,
            borderTopWidth: 0,
            borderColor: stroke,
            borderBottomLeftRadius: 3,
            borderBottomRightRadius: 3,
            backgroundColor: focused ? "rgba(225, 6, 42, 0.08)" : "transparent",
          }}
        />
      </View>
    );
  }

  if (name === "discover") {
    return (
      <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: weight,
            borderColor: stroke,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 4,
              height: 13,
              borderRadius: 2,
              backgroundColor: stroke,
              transform: [{ rotate: "38deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: focused ? stroke : "transparent",
              borderWidth: focused ? 0 : 1.8,
              borderColor: stroke,
            }}
          />
        </View>
      </View>
    );
  }

  if (name === "outings") {
    return (
      <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: 21,
            height: 20,
            borderRadius: 5,
            borderWidth: weight,
            borderColor: stroke,
            marginTop: 2,
            backgroundColor: focused ? "rgba(225, 6, 42, 0.08)" : "transparent",
          }}
        >
          <View style={{ position: "absolute", top: 5, left: 0, right: 0, height: weight, backgroundColor: stroke }} />
          <View style={{ position: "absolute", top: -4, left: 4, width: weight, height: 7, borderRadius: 2, backgroundColor: stroke }} />
          <View style={{ position: "absolute", top: -4, right: 4, width: weight, height: 7, borderRadius: 2, backgroundColor: stroke }} />
          <View style={{ position: "absolute", bottom: 3.5, left: 5, width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: stroke }} />
          <View style={{ position: "absolute", bottom: 3.5, right: 5, width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: stroke }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          top: 3,
          width: 9,
          height: 9,
          borderRadius: 5,
          borderWidth: weight,
          borderColor: stroke,
          backgroundColor: focused ? stroke : "transparent",
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 2,
          width: 20,
          height: 11,
          borderTopLeftRadius: 11,
          borderTopRightRadius: 11,
          borderWidth: weight,
          borderBottomWidth: 0,
          borderColor: stroke,
        }}
      />
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.1, marginTop: 3 },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(13,13,13,0.98)",
          borderTopColor: theme.colors.borderStrong,
          borderTopWidth: 1,
          height: 80,
          paddingTop: 4,
          paddingBottom: 12,
          shadowColor: "#000000",
          shadowOpacity: 0.36,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: -8 },
          elevation: 18,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Discover", tabBarIcon: ({ color, focused }) => <TabIcon name="discover" color={color} focused={focused} /> }} />
      <Tabs.Screen name="outings" options={{ title: "Outings", tabBarIcon: ({ color, focused }) => <TabIcon name="outings" color={color} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <TabIcon name="profile" color={color} focused={focused} /> }} />
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="results" options={{ href: null }} />
      <Tabs.Screen name="complete" options={{ href: null }} />
    </Tabs>
  );
}
