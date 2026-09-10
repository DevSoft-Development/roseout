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
    <View style={[styles.shell, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
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
                    borderColor: current ? theme.colors.accent : complete ? theme.colors.accent : theme.colors.borderStrong,
                    backgroundColor: current ? theme.colors.accent : complete ? theme.colors.surface : theme.colors.background,
                  },
                ]}
              >
                <AppText variant="caption" style={{ color: current ? theme.colors.onAccent : complete ? theme.colors.accent : theme.colors.textMuted }}>
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
        <AppText variant="eyebrow" accent>{active.label}</AppText>
        <AppText variant="caption" muted>{activeStep} of 4</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  contents: { flex: 1, flexDirection: "row", alignItems: "center" },
  circle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  line: { height: 1, flex: 1, marginHorizontal: 7 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
