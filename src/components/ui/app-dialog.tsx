import {
  Fonts,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

type DialogKind = "alert" | "confirm" | "prompt" | "options";
export type DialogOption = {
  label: string;
  value: string;
  destructive?: boolean;
  cancel?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

type DialogConfig = {
  id: number;
  title: string;
  message?: string;
  kind: DialogKind;
  options?: DialogOption[];
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
};

type AppDialogViewProps = {
  config: DialogConfig;
  onSelect: (value: string | null) => void;
};

function AppDialogView({ config, onSelect }: AppDialogViewProps) {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const styles = makeStyles(colors, isDark);
  const [inputValue, setInputValue] = useState(config.initialValue ?? "");

  const choose = (option: DialogOption) => {
    if (config.kind === "prompt") {
      if (option.cancel) {
        onSelect(null);
        return;
      }
      if (option.value === "confirm") {
        onSelect(inputValue.trim());
        return;
      }
    }
    onSelect(option.value);
  };

  const close = () => onSelect(null);
  const isOptions = config.kind === "options";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {isOptions ? (
          <View style={styles.actionSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={2}>{config.title}</Text>
            {!!config.message && <Text style={styles.sheetMessage}>{config.message}</Text>}
            <View style={styles.optionsList}>
              {(config.options ?? []).map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => choose(option)}
                  style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
                >
                  {option.icon ? (
                    <Ionicons
                      name={option.icon}
                      size={19}
                      color={option.destructive ? colors.accentWarm : colors.textSecondary}
                    />
                  ) : null}
                  <Text style={[styles.optionText, option.destructive && styles.destructiveText]}>
                    {option.label}
                  </Text>
                  {option.destructive ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.accentWarm} />
                  ) : null}
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.dialogCard}>
            <View style={styles.dialogIcon}>
              <Ionicons
                name={config.kind === "alert" ? "information-circle-outline" : config.kind === "prompt" ? "create-outline" : "help-circle-outline"}
                size={25}
                color={colors.tealStrong}
              />
            </View>
            <Text style={styles.dialogTitle}>{config.title}</Text>
            {!!config.message && <Text style={styles.dialogMessage}>{config.message}</Text>}
            {config.kind === "prompt" ? (
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={config.placeholder ?? "Enter a value"}
                placeholderTextColor={colors.textTertiary}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => onSelect(inputValue.trim())}
                style={styles.promptInput}
              />
            ) : null}
            <View style={styles.dialogActions}>
              {(config.options ?? []).map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => choose(option)}
                  style={({ pressed }) => [
                    styles.dialogButton,
                    option.cancel ? styles.secondaryButton : styles.primaryButton,
                    option.destructive && styles.destructiveButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.dialogButtonText,
                      option.cancel && styles.secondaryButtonText,
                      option.destructive && styles.destructiveButtonText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function useAppDialog() {
  const [config, setConfig] = useState<DialogConfig | null>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);
  const counterRef = useRef(0);

  const open = useCallback((next: Omit<DialogConfig, "id">) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current?.(null);
      resolverRef.current = resolve;
      counterRef.current += 1;
      setConfig({ ...next, id: counterRef.current });
    });
  }, []);

  const finish = useCallback((value: string | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setConfig(null);
    resolve?.(value);
  }, []);

  const showAlert = useCallback(
    async (title: string, message: string, buttonLabel = "Got it") => {
      await open({
        title,
        message,
        kind: "alert",
        options: [{ label: buttonLabel, value: "ok" }],
      });
    },
    [open],
  );

  const showConfirm = useCallback(
    async (
      title: string,
      message: string,
      confirmLabel = "Continue",
      destructive = false,
      cancelLabel = "Cancel",
    ) => {
      const result = await open({
        title,
        message,
        kind: "confirm",
        options: [
          { label: cancelLabel, value: "cancel", cancel: true },
          { label: confirmLabel, value: "confirm", destructive },
        ],
      });
      return result === "confirm";
    },
    [open],
  );

  const showPrompt = useCallback(
    async (
      title: string,
      message: string,
      initialValue = "",
      placeholder = "Enter a value",
    ) => {
      const result = await open({
        title,
        message,
        kind: "prompt",
        initialValue,
        placeholder,
        options: [
          { label: "Cancel", value: "cancel", cancel: true },
          { label: "Save", value: "confirm" },
        ],
      });
      return result;
    },
    [open],
  );

  const showOptions = useCallback(
    async (title: string, message: string, options: DialogOption[]) => {
      return open({ title, message, kind: "options", options });
    },
    [open],
  );

  const dialog = config ? (
    <AppDialogView key={config.id} config={config} onSelect={finish} />
  ) : null;

  return { dialog, showAlert, showConfirm, showPrompt, showOptions };
}

function makeStyles(colors: ReturnType<typeof useAppTheme>, isDark: boolean) {
  const shadow = isDark ? Shadows.dark.card : Shadows.light.card;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 22,
      backgroundColor: "rgba(5, 12, 18, 0.58)",
    },
    dialogCard: {
      width: "100%",
      maxWidth: 390,
      borderRadius: Radius.xl,
      padding: Spacing.five,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      ...shadow,
    },
    dialogIcon: {
      width: 48,
      height: 48,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(92, 138, 113, 0.18)" : "rgba(92, 138, 113, 0.12)",
      marginBottom: Spacing.three,
    },
    dialogTitle: {
      ...Typography.headline,
      fontFamily: Fonts?.sans,
      fontSize: 18,
      fontWeight: "800",
      color: colors.textPrimary,
      textAlign: "center",
    },
    dialogMessage: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: Spacing.two,
    },
    promptInput: {
      width: "100%",
      minHeight: 48,
      marginTop: Spacing.four,
      paddingHorizontal: Spacing.three,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      fontFamily: Fonts?.sans,
      fontSize: 14,
    },
    dialogActions: {
      width: "100%",
      flexDirection: "row",
      gap: Spacing.two,
      marginTop: Spacing.five,
    },
    dialogButton: {
      flex: 1,
      minHeight: 46,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.three,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.pill,
    },
    primaryButton: { backgroundColor: colors.primary },
    secondaryButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    destructiveButton: { backgroundColor: colors.accentWarm },
    dialogButtonText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "800",
      color: colors.textInverse,
    },
    secondaryButtonText: { color: colors.textPrimary },
    destructiveButtonText: { color: "#FFFFFF" },
    actionSheet: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: Platform.OS === "ios" ? 24 : 12,
      borderRadius: Radius.xl,
      padding: Spacing.four,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow,
    },
    sheetHandle: {
      width: 38,
      height: 4,
      borderRadius: Radius.pill,
      alignSelf: "center",
      backgroundColor: colors.borderStrong,
      marginBottom: Spacing.four,
    },
    sheetTitle: {
      ...Typography.headline,
      fontFamily: Fonts?.sans,
      fontWeight: "800",
      fontSize: 17,
      color: colors.textPrimary,
    },
    sheetMessage: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
      marginTop: Spacing.one,
      marginBottom: Spacing.two,
    },
    optionsList: { marginTop: Spacing.two },
    optionRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      paddingHorizontal: Spacing.two,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionText: {
      ...Typography.bodyMedium,
      fontFamily: Fonts?.sans,
      color: colors.textPrimary,
      fontSize: 14,
      flex: 1,
    },
    destructiveText: { color: colors.accentWarm, fontWeight: "700" },
    sheetCancel: {
      minHeight: 48,
      marginTop: Spacing.three,
      borderRadius: Radius.pill,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetCancelText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    pressed: { opacity: 0.72 },
  });
}
