import { TextInput, View, type TextInputProps } from "react-native";
import { useAppTheme } from "@/providers/ThemeProvider";

export function SearchField({ style, ...props }: TextInputProps) {
  const { theme } = useAppTheme();
  return (
    <View
      style={{
        minHeight: 58,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.surfaceElevated,
        justifyContent: "center",
        shadowColor: "#000000",
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.textSubtle}
        selectionColor={theme.colors.accent}
        style={[
          theme.typography.body,
          { color: theme.colors.text, paddingHorizontal: theme.spacing.md, paddingVertical: 16 },
          style,
        ]}
      />
    </View>
  );
}
