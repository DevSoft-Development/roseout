import { Pressable, type PressableProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = PressableProps & { label: string; selected?: boolean };

export function Chip({ label, selected, style, ...props }: Props) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      {...props}
      style={(state) => {
        const { pressed } = state;
        return [
          {
            minHeight: 38,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 14,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: selected ? theme.colors.accent : theme.colors.border,
            backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
            opacity: pressed ? 0.75 : 1,
          },
          typeof style === "function" ? style(state) : style,
        ];
      }}
    >
      <AppText variant="label" accent={selected}>{label}</AppText>
    </Pressable>
  );
}
