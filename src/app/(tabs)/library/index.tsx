import type { DialogOption } from "@/components/ui/app-dialog";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Fonts,
  Layout,
  Radius,
  Spacing,
  Typography,
  useAppTheme,
  type Theme,
} from "@/constants/theme";
import { useRecordingModal } from "@/contexts/recording-modal-context";
import { useRecordings } from "@/contexts/recordings-context";
import type { Category } from "@/lib/database";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CATEGORIES: Category[] = ["All", "People", "Motivation", "Reminders"];

function formatDuration(millis: number) {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(epoch: number) {
  const date = new Date(epoch);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function LibraryScreen() {
  const colors = useAppTheme();
  const styles = createStyles(colors);
  const { openRecordModal } = useRecordingModal();
  const {
    recordings,
    removeRecording,
    toggleFavorite,
    updateTitle,
    toggleSyncStatus,
    playRecording,
    currentPlayingId,
    isPlaying,
  } = useRecordings();
  const { dialog, showAlert, showConfirm, showPrompt, showOptions } = useAppDialog();

  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = recordings.filter((item) => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  async function handleActionSheet(item: (typeof recordings)[number]) {
    const options: DialogOption[] = [
      {
        value: "favorite",
        label: item.favorite ? "Remove from favorites" : "Add to favorites",
        icon: item.favorite ? "heart-dislike-outline" : "heart-outline",
      },
      {
        value: "sync",
        label: item.synced ? "Mark as local only" : "Mark as synced",
        icon: item.synced ? "cloud-offline-outline" : "cloud-upload-outline",
      },
      { value: "rename", label: "Rename recording", icon: "create-outline" },
      { value: "delete", label: "Delete recording", icon: "trash-outline", destructive: true },
    ];

    const action = await showOptions(
      item.title,
      `${formatDuration(item.durationMillis)} · ${item.synced ? "Marked as synced" : "Stored on this device"}`,
      options,
    );

    if (action === "favorite") {
      try {
        await toggleFavorite(item.id, Boolean(item.favorite));
      } catch (error) {
        console.error("Favorite update failed:", error);
        void showAlert("Update failed", "The favorite status could not be changed.");
      }
      return;
    }

    if (action === "sync") {
      const nextSynced = !Boolean(item.synced);
      const confirmed = await showConfirm(
        nextSynced ? "Mark as synced?" : "Mark as local only?",
        "This changes the recording's sync label only. Cloud upload is not connected yet.",
        nextSynced ? "Mark synced" : "Mark local",
      );
      if (!confirmed) return;
      try {
        await toggleSyncStatus(item.id, Boolean(item.synced));
      } catch (error) {
        console.error("Sync status update failed:", error);
        void showAlert("Update failed", "The sync status could not be changed.");
      }
      return;
    }

    if (action === "rename") {
      const newTitle = await showPrompt(
        "Rename recording",
        "Choose a short title that is easy to recognize.",
        item.title,
        "Recording title",
      );
      if (newTitle === null || !newTitle.trim()) return;
      try {
        await updateTitle(item.id, newTitle.trim());
      } catch (error) {
        console.error("Rename failed:", error);
        void showAlert("Rename failed", "The recording title could not be updated.");
      }
      return;
    }

    if (action === "delete") {
      const confirmed = await showConfirm(
        "Delete recording?",
        `“${item.title}” will be permanently removed from this device.`,
        "Delete recording",
        true,
      );
      if (!confirmed) return;
      await removeRecording(item.id, item.uri);
    }
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.pageWidth}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>My Library</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={openRecordModal}
                accessibilityRole="button"
                accessibilityLabel="Add new recording"
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={28} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.categoriesRow}>
              {CATEGORIES.map((category) => {
                const selected = activeCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryPill, selected && styles.categoryPillSelected]}
                    onPress={() => setActiveCategory(category)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search recordings..."
                placeholderTextColor={colors.textTertiary}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.sectionHeader}>Saved moments ({filtered.length})</Text>

            <View style={styles.recordingsList}>
              {filtered.map((item, index) => {
                const isLast = index === filtered.length - 1;
                const activeThis = currentPlayingId === item.id && isPlaying;
                return (
                  <View key={item.id} style={[styles.recordingRow, !isLast && styles.rowBorder]}>
                    <View style={[styles.thumbnail, { backgroundColor: colors[item.surface] }]}>
                      <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                    </View>
                    <View style={styles.recordingDetails}>
                      <View style={styles.titleRow}>
                        <Text style={styles.recordingTitle} numberOfLines={1}>{item.title}</Text>
                        <Ionicons
                          name={item.synced ? "cloud-done" : "cloud-offline-outline"}
                          size={13}
                          color={item.synced ? colors.tealStrong : colors.textTertiary}
                          style={styles.badgeIcon}
                        />
                        {Boolean(item.favorite) ? (
                          <Ionicons name="heart" size={12} color={colors.accentWarm} style={styles.badgeIcon} />
                        ) : null}
                      </View>
                      <Text style={styles.recordingMeta}>
                        {formatDate(item.createdAt)} · {formatDuration(item.durationMillis)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.playButton, activeThis && { backgroundColor: colors.primary }]}
                      onPress={() => playRecording(item.id, item.uri)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${item.title}`}
                    >
                      <Ionicons
                        name={activeThis ? "pause" : "play"}
                        size={13}
                        color={activeThis ? colors.textInverse : colors.primary}
                        style={styles.playIconOffset}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => void handleActionSheet(item)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`More options for ${item.title}`}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {filtered.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No recordings found in this view.</Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      {dialog}
    </>
  );
}

function createStyles(colors: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: Layout.screenHorizontal, paddingTop: Spacing.one, paddingBottom: Spacing.eight + 88 },
    pageWidth: { width: "100%", maxWidth: Layout.contentMaxWidth, alignSelf: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.two, marginBottom: Spacing.four },
    headerTitle: { ...Typography.display, fontFamily: Fonts?.serif, fontSize: 27, lineHeight: 32, fontWeight: "700", letterSpacing: -0.4, color: colors.primary },
    addButton: { width: Layout.iconButton, height: Layout.iconButton, alignItems: "flex-end", justifyContent: "center" },
    categoriesRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two, marginBottom: Spacing.four, flexWrap: "wrap" },
    categoryPill: { paddingHorizontal: Spacing.four, paddingVertical: 7, borderRadius: Radius.pill, justifyContent: "center", alignItems: "center" },
    categoryPillSelected: { backgroundColor: colors.primary },
    categoryText: { ...Typography.label, fontFamily: Fonts?.sans, fontSize: 13, fontWeight: "500", color: colors.textSecondary },
    categoryTextSelected: { color: colors.textInverse, fontWeight: "700" },
    searchBox: { height: 46, paddingHorizontal: Spacing.four, borderRadius: Radius.pill, flexDirection: "row", alignItems: "center", gap: Spacing.two, backgroundColor: colors.backgroundElement, marginBottom: Spacing.five },
    searchInput: { ...Typography.body, fontFamily: Fonts?.sans, fontSize: 14, flex: 1, minWidth: 0, paddingVertical: 0, color: colors.textPrimary },
    sectionHeader: { ...Typography.title, fontFamily: Fonts?.sans, fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: Spacing.two },
    recordingsList: { width: "100%" },
    recordingRow: { minHeight: 70, paddingVertical: Spacing.three, flexDirection: "row", alignItems: "center", gap: Spacing.three },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    thumbnail: { width: 48, height: 48, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
    recordingDetails: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    badgeIcon: { marginLeft: 2 },
    recordingTitle: { ...Typography.bodyMedium, fontFamily: Fonts?.sans, fontSize: 14, lineHeight: 19, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
    recordingMeta: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 12, marginTop: 3, color: colors.textSecondary },
    playButton: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundSelected },
    playIconOffset: { marginLeft: 2 },
    moreButton: { width: 30, height: 36, alignItems: "center", justifyContent: "center", marginLeft: Spacing.half },
    emptyContainer: { paddingVertical: Spacing.seven, alignItems: "center", justifyContent: "center" },
    emptyText: { ...Typography.body, fontFamily: Fonts?.sans, fontSize: 13, color: colors.textTertiary },
  });
}
