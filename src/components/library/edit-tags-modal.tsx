import { TagSelector } from "@/components/tags/tag-selector";
import {
    Fonts,
    Layout,
    Radius,
    Shadows,
    Spacing,
    Typography,
    useAppTheme,
    useResponsiveLayout,
    type Theme,
} from "@/constants/theme";
import {
    useRecordings,
    type RecordingItem,
} from "@/contexts/recordings-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export type EditTagsModalProps = {
  recording: RecordingItem | null;
  visible: boolean;
  onClose: () => void;
  onSaved?: (updated: RecordingItem) => void;
};

function formatDuration(millis: number) {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function EditTagsModal({
  recording,
  visible,
  onClose,
  onSaved,
}: EditTagsModalProps) {
  const colors = useAppTheme();
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, responsive);

  const { updateRecording } = useRecordings();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (recording) {
      setTitle(recording.title);
      setTags(recording.tags && recording.tags.length > 0 ? recording.tags : [recording.category]);
    }
  }, [recording]);

  if (!recording) return null;

  async function handleSave() {
    if (!recording || isSaving) return;
    setIsSaving(true);
    try {
      const cleanTitle = title.trim() || recording.title;
      const cleanTags = tags.length > 0 ? tags : [recording.category || "Motivation"];
      const updated = await updateRecording(recording.id, {
        title: cleanTitle,
        tags: cleanTags,
        category: cleanTags[0],
      });
      onSaved?.(updated);
      onClose();
    } catch (err) {
      console.warn("Failed to update tags:", err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.flexFill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              style={styles.roundButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Edit Voice Tags</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {formatDuration(recording.durationMillis)} · Voice Moment
              </Text>
            </View>

            <View style={styles.roundButtonSpacer} />
          </View>

          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pageWidth}>
              <View style={styles.card}>
                <View style={styles.fieldHeader}>
                  <Ionicons name="create-outline" size={16} color={colors.tealStrong} />
                  <Text style={styles.fieldLabel}>Recording Name</Text>
                </View>

                <View style={styles.inputWrap}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Enter recording title..."
                    placeholderTextColor={colors.textTertiary}
                    style={styles.input}
                    maxLength={80}
                    returnKeyType="done"
                  />
                  {title.length > 0 ? (
                    <TouchableOpacity onPress={() => setTitle("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={[styles.card, { marginTop: Spacing.four }]}>
                <TagSelector
                  selectedTags={tags}
                  onChangeSelectedTags={setTags}
                  label="Select & Manage Tags"
                  helperText="Tap tags to attach or detach. Type a new tag to create it, or tap × on a tag chip to delete it completely."
                />
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, Spacing.four) },
            ]}
          >
            <View style={styles.footerInner}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => void handleSave()}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={19} color={colors.textInverse} />
                <Text style={styles.saveBtnText}>
                  {isSaving ? "Saving..." : "Save Tags"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(
  colors: Theme,
  responsive: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    flexFill: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: responsive.horizontalPadding,
      paddingVertical: Spacing.three,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    roundButton: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    roundButtonSpacer: {
      width: Layout.iconButton,
      height: Layout.iconButton,
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: Spacing.two,
    },
    headerTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 18,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.tealStrong,
      marginTop: 2,
    },
    scrollContent: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.four,
      paddingBottom: Spacing.eight,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    card: {
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...Shadows.light.card,
    },
    fieldHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: Spacing.two,
    },
    fieldLabel: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.three,
      borderRadius: Radius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    input: {
      flex: 1,
      minHeight: 46,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.backgroundElevated,
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.three,
    },
    footerInner: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    cancelBtn: {
      minHeight: Layout.controlHeightLarge,
      paddingHorizontal: Spacing.five,
      borderRadius: Radius.pill,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtnText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    saveBtn: {
      flex: 1,
      minHeight: Layout.controlHeightLarge,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      ...Shadows.light.floating,
    },
    saveBtnText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "800",
      color: colors.textInverse,
    },
  });
}