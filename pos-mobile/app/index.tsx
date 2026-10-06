import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function CashierHome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ThePOSHaven</Text>
        <Text style={styles.title}>Cashier</Text>
        <Text style={styles.copy}>
          This device is ready for location claim, hardware discovery, and POS setup.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070303",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#111111",
    padding: 24,
  },
  eyebrow: {
    color: "#ff6b86",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 10,
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "900",
  },
  copy: {
    marginTop: 12,
    color: "#a8a8a8",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
});
