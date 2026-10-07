import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { claimPosDevice, getPosClaimSession, type PosClaimSession } from "@/lib/device/identity";
import { HttpPosClaimTransport } from "@/lib/device/http-claim-transport";
import { startOnlineOrderInboxLoop } from "@/lib/online-orders/inbox";

const API_BASE = String(Constants.expoConfig?.extra?.posApiBaseUrl || "").replace(/\/$/, "");

export default function CashierHome() {
  const [session, setSession] = useState<PosClaimSession | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [status, setStatus] = useState("Checking device setup…");
  const [lastOrder, setLastOrder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPosClaimSession().then((current) => {
      setSession(current);
      setStatus(current ? "Connected and listening for orders." : "Enter the one-time pairing code from Admin setup.");
    });
  }, []);

  useEffect(() => {
    if (!session || !API_BASE) return;
    const stop = startOnlineOrderInboxLoop({
      baseUrl: API_BASE,
      session,
      intervalMs: 5000,
      onOrder: (dispatch) => {
        setLastOrder(`${dispatch.order.customerName} · ${dispatch.order.id.slice(0, 8).toUpperCase()}`);
        setStatus("Online order received and routed.");
      },
      onError: (error) => setStatus(`Order inbox: ${error.message}`),
    });
    return stop;
  }, [session]);

  async function claim() {
    if (!API_BASE) {
      setStatus("POS API is not configured.");
      return;
    }
    setBusy(true);
    try {
      const next = await claimPosDevice({
        pairingCode,
        transport: new HttpPosClaimTransport(API_BASE),
      });
      setSession(next);
      setPairingCode("");
      setStatus("Device claimed. Listening for online orders.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to claim this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ThePOSHaven</Text>
        <Text style={styles.title}>Cashier</Text>
        <Text style={styles.copy}>{status}</Text>

        {!session ? (
          <View style={styles.form}>
            <Text style={styles.label}>Pairing code</Text>
            <TextInput
              value={pairingCode}
              onChangeText={setPairingCode}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste or scan pairing code"
              placeholderTextColor="#6f6f75"
              style={styles.input}
            />
            <TouchableOpacity
              onPress={claim}
              disabled={busy || !pairingCode.trim()}
              style={[styles.button, (busy || !pairingCode.trim()) && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{busy ? "Connecting…" : "Connect device"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ready}>
            <Text style={styles.readyTitle}>Ready</Text>
            <Text style={styles.readyCopy}>Location {session.locationId}</Text>
            {lastOrder ? <Text style={styles.order}>Latest: {lastOrder}</Text> : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070303", justifyContent: "center", padding: 24 },
  card: { borderRadius: 24, borderWidth: 1, borderColor: "#2a2a2a", backgroundColor: "#111111", padding: 24 },
  eyebrow: { color: "#ff6b86", fontSize: 12, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase" },
  title: { marginTop: 10, color: "#ffffff", fontSize: 36, fontWeight: "900" },
  copy: { marginTop: 12, color: "#a8a8a8", fontSize: 16, fontWeight: "600", lineHeight: 24 },
  form: { marginTop: 24, gap: 10 },
  label: { color: "#ffffff", fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#353535", color: "#ffffff", paddingHorizontal: 14, fontSize: 16 },
  button: { marginTop: 6, minHeight: 48, borderRadius: 999, backgroundColor: "#ec0b5b", alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  ready: { marginTop: 24, borderRadius: 18, backgroundColor: "#191919", padding: 18 },
  readyTitle: { color: "#76d09a", fontSize: 18, fontWeight: "900" },
  readyCopy: { marginTop: 4, color: "#a8a8a8", fontWeight: "600" },
  order: { marginTop: 12, color: "#ffffff", fontWeight: "800" },
});
