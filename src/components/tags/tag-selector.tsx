import {
    Fonts,
    Radius,
    Spacing,
    Typography,
    useAppTheme,
    type Theme,
} from "@/constants/theme";
import { useAvailableTags } from "@/lib/tags/tags-store";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export type TagSelectorProps = {
  selectedTags: string[];
  onChangeSelectedTags: (nextTags: string[]) => void;
  label?: string;
  helperText?: string;
};

export function TagSelector({
  selectedTags,
  onChangeSelectedTags,
  label = "Tags",
  helperText = "Tap to select tags, add your own, or tap × to remove a tag.",
}: TagSelectorProps) {
  const colors = useAppTheme();
  const styles = makeStyles(colors);
  const { availableTags, addTag, removeTag, resetTags } = useAvailableTags();

  const [newTagText, setNewTagText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  function toggleTag(tag: string) {
    const exists = selectedTags.some(
      (item) => item.toLowerCase() === tag.toLowerCase(),
    );
    if (exists) {
      const filtered = selectedTags.filter(
        (item) => item.toLowerCase() !== tag.toLowerCase(),
      );
      onChangeSelectedTags(filtered);
    } else {
      onChangeSelectedTags([...selectedTags, tag]);
    }
  }

  function handleCreateTag() {
    const cleaned = newTagText.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      setIsAdding(false);
      return;
    }

    const updated = addTag(cleaned);
    const matched =
      updated.find((item) => item.toLowerCase() === cleaned.toLowerCase()) ??
      cleaned;

    if (
      !selectedTags.some((item) => item.toLowerCase() === matched.toLowerCase())
    ) {
      onChangeSelectedTags([...selectedTags, matched]);
    }

    setNewTagText("");
    setIsAdding(false);
  }

  function handleDeleteTag(tag: string) {
    removeTag(tag);
    if (selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      onChangeSelectedTags(
        selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase()),
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <Ionicons name="pricetags-outline" size={15} color={colors.tealStrong} />
          <Text style={styles.label}>{label}</Text>
          {selectedTags.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{selectedTags.length}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          {availableTags.length === 0 ? (
            <TouchableOpacity onPress={resetTags} hitSlop={8}>
              <Text style={styles.resetText}>Restore defaults</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.addTriggerButton}
            onPress={() => setIsAdding((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isAdding ? "close" : "add"}
              size={15}
              color={colors.tealStrong}
            />
            <Text style={styles.addTriggerText}>
              {isAdding ? "Cancel" : "New tag"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isAdding ? (
        <View style={styles.inputRow}>
          <TextInput
            value={newTagText}
            onChangeText={setNewTagText}
            placeholder="Enter custom tag (e.g. Workout, Study)..."
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoFocus
            maxLength={28}
            returnKeyType="done"
            onSubmitEditing={handleCreateTag}
          />
          <TouchableOpacity
            style={[
              styles.confirmAddButton,
              !newTagText.trim() && styles.confirmAddButtonDisabled,
            ]}
            onPress={handleCreateTag}
            disabled={!newTagText.trim()}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color={colors.textInverse} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.tagsWrap}>
        {availableTags.map((tag) => {
          const isSelected = selectedTags.some(
            (item) => item.toLowerCase() === tag.toLowerCase(),
          );
          return (
            <View
              key={tag}
              style={[styles.tagChip, isSelected && styles.tagChipSelected]}
            >
              <Pressable
                onPress={() => toggleTag(tag)}
                style={styles.tagPressArea}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`Select ${tag} tag`}
              >
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "pricetag-outline"}
                  size={14}
                  color={isSelected ? colors.textInverse : colors.tealStrong}
                />
                <Text
                  style={[
                    styles.tagText,
                    isSelected && styles.tagTextSelected,
                  ]}
                >
                  {tag}
                </Text>
              </Pressable>

              <TouchableOpacity
                onPress={() => handleDeleteTag(tag)}
                hitSlop={8}
                style={[
                  styles.deleteChipButton,
                  isSelected && styles.deleteChipButtonSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${tag} tag`}
              >
                <Ionicons
                  name="close"
                  size={12}
                  color={isSelected ? colors.textInverse : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          );
        })}

        {availableTags.length === 0 ? (
          <Text style={styles.emptyTagsText}>
            No tags available. Tap "New tag" or "Restore defaults" above.
          </Text>
        ) : null}
      </View>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

function makeStyles(colors: Theme) {
  return StyleSheet.create({
    container: {
      width: "100%",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.two,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one + 2,
    },
    label: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    countBadge: {
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      fontWeight: "800",
      color: colors.tealStrong,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    resetText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    addTriggerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.two + 2,
      paddingVertical: 5,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addTriggerText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      marginBottom: Spacing.three,
    },
    input: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: Spacing.three,
      borderRadius: Radius.md,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      color: colors.textPrimary,
    },
    confirmAddButton: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmAddButtonDisabled: {
      opacity: 0.45,
    },
    tagsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.two,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    tagChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tagPressArea: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingLeft: Spacing.three,
      paddingRight: Spacing.two,
      paddingVertical: 7,
    },
    tagText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    tagTextSelected: {
      color: colors.textInverse,
    },
    deleteChipButton: {
      paddingRight: Spacing.two + 2,
      paddingLeft: 4,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    deleteChipButtonSelected: {
      borderLeftColor: "rgba(255, 255, 255, 0.22)",
    },
    emptyTagsText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textTertiary,
      paddingVertical: Spacing.two,
    },
    helperText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: Spacing.two,
    },
  });
}