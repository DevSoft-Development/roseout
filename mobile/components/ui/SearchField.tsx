import { TextInput, View, type TextInputProps } from "react-native";
import { useAppTheme } from "@/providers/ThemeProvider";

export function SearchField({ style, ...props }: TextInputProps) {
  const { theme } = useAppTheme();
  return (
    <View
      style={{
        minHeight: 54,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.surfaceElevated,
        justifyContent: "center",
      }}
    >
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.textSubtle}
        style={[
          theme.typography.body,
          { color: theme.colors.text, paddingHorizontal: theme.spacing.md, paddingVertical: 14 },
          style,
        ]}
      />
    </View>
  );
}
