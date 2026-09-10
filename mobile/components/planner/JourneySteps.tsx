import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type Step = 1 | 2 | 3 | 4;

const STEPS: Array<{ number: Step; label: string }> = [
  { number: 1, label: "PLAN" },
  { number: 2, label: "MAKE IT YOURS" },
  { number: 3, label: "PICK" },
  { number: 4, label: "COMPLETE OUTING" },
];

export function JourneySteps({ activeStep }: { activeStep: Step }) {
  const { theme } = useAppTheme();
  const active = STEPS.find((step) => step.number === activeStep) || STEPS[0];

  return (
    <View style={[styles.shell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        {STEPS.map((step, index) => {
          const complete = activeStep > step.number;
          const current = activeStep === step.number;
          return (
            <View key={step.number} style={styles.contents}>
              <View
                style={[
                  styles.circle,
                  {
                    borderColor: current || complete ? theme.colors.accent : theme.colors.borderStrong,
                    backgroundColor: current ? theme.colors.accent : complete ? theme.colors.accentSoft : theme.colors.background,
                    shadowColor: current ? theme.colors.accent : "#000000",
                    shadowOpacity: current ? 0.36 : 0,
                    shadowRadius: current ? 10 : 0,
                    shadowOffset: { width: 0, height: 4 },
                  },
                ]}
              >
                <AppText variant="caption" style={{ color: current ? theme.colors.onAccent : complete ? theme.colors.accent : theme.colors.textMuted, fontWeight: "900" }}>
                  {complete ? "✓" : step.number}
                </AppText>
              </View>
              {index < STEPS.length - 1 ? (
                <View style={[styles.line, { backgroundColor: complete ? theme.colors.accent : theme.colors.border }]} />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.labelRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="eyebrow" accent>{active.label}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 3 }}>Step {activeStep} of 4</AppText>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }]}>
          <AppText variant="caption" accent>{activeStep}/4</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 15, gap: 12, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  row: { flexDirection: "row", alignItems: "center" },
  contents: { flex: 1, flexDirection: "row", alignItems: "center" },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  line: { height: 2, flex: 1, marginHorizontal: 7, borderRadius: 999 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: { minWidth: 46, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
});
