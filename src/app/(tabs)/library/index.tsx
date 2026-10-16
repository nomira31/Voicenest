import { EditTagsModal } from "@/components/library/edit-tags-modal";
import { useAppDialog } from "@/components/ui/app-dialog";
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
import { useRecordingModal } from "@/contexts/recording-modal-context";
import {
  useRecordings,
  type RecordingItem,
} from "@/contexts/recordings-context";
import { useAvailableTags } from "@/lib/tags/tags-store";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
    return `Today · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export default function LibraryScreen() {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const responsive = useResponsiveLayout();
  const styles = makeStyles(colors, isDark, responsive);

  const { openRecordModal } = useRecordingModal();
  const {
    recordings,
    playRecording,
    currentPlayingId,
    isPlaying,
    deleteRecording,
  } = useRecordings();
  const { availableTags } = useAvailableTags();
  const { dialog, showAlert, showConfirm, showOptions } = useAppDialog();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("All");
  const [editingTarget, setEditingTarget] = useState<RecordingItem | null>(null);

  const filterTagsList = useMemo(() => {
    const recordingTagsSet = new Set<string>();
    recordings.forEach((r) => {
      const tags = r.tags && r.tags.length > 0 ? r.tags : [r.category];
      tags.forEach((t) => {
        if (t?.trim()) recordingTagsSet.add(t.trim());
      });
    });

    availableTags.forEach((t) => {
      if (t?.trim()) recordingTagsSet.add(t.trim());
    });

    return ["All", ...Array.from(recordingTagsSet)];
  }, [availableTags, recordings]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { All: recordings.length };
    recordings.forEach((r) => {
      const tags = r.tags && r.tags.length > 0 ? r.tags : [r.category];
      tags.forEach((t) => {
        const clean = t?.trim();
        if (clean) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });
    return counts;
  }, [recordings]);

  const filteredRecordings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recordings.filter((item) => {
      const itemTags = item.tags && item.tags.length > 0 ? item.tags : [item.category];

      const matchesTag =
        selectedTagFilter === "All" ||
        itemTags.some((t) => t.toLowerCase() === selectedTagFilter.toLowerCase());

      if (!matchesTag) return false;
      if (!q) return true;

      const titleMatch = item.title.toLowerCase().includes(q);
      const tagMatch = itemTags.some((t) => t.toLowerCase().includes(q));
      return titleMatch || tagMatch;
    });
  }, [recordings, searchQuery, selectedTagFilter]);

  async function handleMoreActions(item: RecordingItem) {
    const action = await showOptions(
      item.title,
      `${formatDuration(item.durationMillis)} · ${item.tags?.join(", ") || item.category}`,
      [
        {
          label: "Edit Tags & Name",
          value: "edit_tags",
          icon: "pricetag-outline",
        },
        {
          label: "Share Audio",
          value: "share",
          icon: "share-outline",
        },
        {
          label: "Delete Recording",
          value: "delete",
          icon: "trash-outline",
          destructive: true,
        },
      ],
    );

    if (action === "edit_tags") {
      setEditingTarget(item);
    } else if (action === "share") {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        void showAlert("Share Unavailable", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(item.uri, {
        dialogTitle: `Share ${item.title}`,
      });
    } else if (action === "delete") {
      const confirmed = await showConfirm(
        "Delete Recording?",
        `"${item.title}" will be permanently removed from your library.`,
        "Delete",
        true,
      );
      if (confirmed) {
        await deleteRecording(item.id);
      }
    }
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.pageWidth}>
          <View style={styles.header}>
            <View>
              <Text style={styles.pageTitle}>Voice Library</Text>
              <Text style={styles.pageSubtitle}>
                {recordings.length} moment{recordings.length === 1 ? "" : "s"} captured
              </Text>
            </View>

            <TouchableOpacity
              style={styles.recordPill}
              onPress={openRecordModal}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Record voice"
            >
              <Ionicons name="mic" size={16} color={colors.textInverse} />
              <Text style={styles.recordPillText}>Record</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by title or tag..."
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagsFilterScroll}
            >
              {filterTagsList.map((tag) => {
                const isSelected = selectedTagFilter === tag;
                const count = tagCounts[tag] || 0;
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipSelected,
                    ]}
                    onPress={() => setSelectedTagFilter(tag)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Ionicons
                      name={tag === "All" ? "layers-outline" : "pricetag-outline"}
                      size={13}
                      color={isSelected ? colors.textInverse : colors.tealStrong}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextSelected,
                      ]}
                    >
                      {tag}
                    </Text>
                    <View
                      style={[
                        styles.filterCountBadge,
                        isSelected && styles.filterCountBadgeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterCountText,
                          isSelected && styles.filterCountTextSelected,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <ScrollView
          style={styles.listArea}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageWidth}>
            {filteredRecordings.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}>
                  <Ionicons
                    name={recordings.length === 0 ? "mic-outline" : "pricetags-outline"}
                    size={30}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {recordings.length === 0
                    ? "No recordings yet"
                    : `No recordings under #${selectedTagFilter}`}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {recordings.length === 0
                    ? "Tap the record button to capture your first thought or affirmation."
                    : searchQuery
                      ? "Try searching for a different keyword or tag."
                      : "Record or import a voice note and attach this tag to it."}
                </Text>
                {selectedTagFilter !== "All" || searchQuery ? (
                  <TouchableOpacity
                    style={styles.clearFilterButton}
                    onPress={() => {
                      setSelectedTagFilter("All");
                      setSearchQuery("");
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.clearFilterText}>Clear all filters</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.cardsGrid}>
                {filteredRecordings.map((item) => {
                  const activeThis = currentPlayingId === item.id && isPlaying;
                  const itemTags =
                    item.tags && item.tags.length > 0 ? item.tags : [item.category];

                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.recordingCard,
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() => playRecording(item.id, item.uri)}
                      onLongPress={() => void handleMoreActions(item)}
                      accessibilityRole="button"
                    >
                      <View style={styles.cardHeaderRow}>
                        <View
                          style={[
                            styles.surfaceThumb,
                            { backgroundColor: colors[item.surface] },
                          ]}
                        >
                          <Ionicons
                            name={item.icon as any}
                            size={20}
                            color={colors.primary}
                          />
                        </View>

                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <View style={styles.timeMetaRow}>
                            <Text style={styles.cardDate}>
                              {formatDate(item.createdAt)}
                            </Text>
                            <Text style={styles.metaDot}>·</Text>
                            <Text style={styles.cardDuration}>
                              {formatDuration(item.durationMillis)}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.playButton,
                            activeThis && { backgroundColor: colors.primary },
                          ]}
                          onPress={() => playRecording(item.id, item.uri)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={activeThis ? "Pause" : "Play"}
                        >
                          <Ionicons
                            name={activeThis ? "pause" : "play"}
                            size={14}
                            color={activeThis ? colors.textInverse : colors.primary}
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.tagsRowContainer}>
                        <View style={styles.tagsPillList}>
                          {itemTags.map((tag) => (
                            <TouchableOpacity
                              key={tag}
                              style={[
                                styles.cardTagBadge,
                                selectedTagFilter === tag && styles.cardTagBadgeActive,
                              ]}
                              onPress={() => setSelectedTagFilter(tag)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.cardTagBadgeText,
                                  selectedTagFilter === tag &&
                                    styles.cardTagBadgeTextActive,
                                ]}
                              >
                                #{tag}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <View style={styles.cardActionIcons}>
                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => setEditingTarget(item)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit tags for ${item.title}`}
                          >
                            <Ionicons
                              name="pricetag-outline"
                              size={16}
                              color={colors.tealStrong}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => void handleMoreActions(item)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="More options"
                          >
                            <Ionicons
                              name="ellipsis-horizontal"
                              size={16}
                              color={colors.textTertiary}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <EditTagsModal
        recording={editingTarget}
        visible={Boolean(editingTarget)}
        onClose={() => setEditingTarget(null)}
      />

      {dialog}
    </>
  );
}

function makeStyles(
  colors: Theme,
  isDark: boolean,
  responsive: ReturnType<typeof useResponsiveLayout>,
) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      paddingHorizontal: responsive.horizontalPadding,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Spacing.one,
      marginBottom: Spacing.four,
    },
    pageTitle: {
      ...Typography.display,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 26 : 30,
      color: colors.textPrimary,
    },
    pageSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    recordPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 38,
      paddingHorizontal: Spacing.four,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
    },
    recordPillText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textInverse,
    },
    searchBox: {
      height: Layout.controlHeight,
      paddingHorizontal: Spacing.four,
      borderRadius: Radius.xl,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.three,
      ...cardShadow,
    },
    searchInput: {
      flex: 1,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      color: colors.textPrimary,
    },
    filterSection: {
      marginBottom: Spacing.two,
      marginHorizontal: -responsive.horizontalPadding,
    },
    tagsFilterScroll: {
      paddingHorizontal: responsive.horizontalPadding,
      gap: Spacing.two,
      paddingVertical: 4,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingLeft: Spacing.three,
      paddingRight: Spacing.two,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    filterChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    filterChipTextSelected: {
      color: colors.textInverse,
    },
    filterCountBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
    },
    filterCountBadgeSelected: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    filterCountText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      fontWeight: "800",
      color: colors.tealStrong,
    },
    filterCountTextSelected: {
      color: colors.textInverse,
    },
    listArea: {
      flex: 1,
    },
    listContent: {
      paddingTop: Spacing.two,
      paddingBottom: Spacing.eight + 88,
    },
    cardsGrid: {
      gap: Spacing.three,
    },
    recordingCard: {
      padding: Spacing.three,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    cardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.995 }],
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    surfaceThumb: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardInfo: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    timeMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    cardDate: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "600",
      color: colors.tealStrong,
    },
    metaDot: {
      color: colors.textTertiary,
      fontSize: 10,
    },
    cardDuration: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 11,
      color: colors.textSecondary,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagsRowContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.three,
      paddingTop: Spacing.two,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: Spacing.two,
    },
    tagsPillList: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    cardTagBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTagBadgeActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cardTagBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    cardTagBadgeTextActive: {
      color: colors.textInverse,
    },
    cardActionIcons: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one,
    },
    iconActionBtn: {
      width: 32,
      height: 32,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyContainer: {
      padding: Spacing.seven,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      marginTop: Spacing.four,
    },
    emptyIconBox: {
      width: 58,
      height: 58,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceYellow,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.three,
    },
    emptyTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 18,
      color: colors.textPrimary,
      textAlign: "center",
    },
    emptySubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: Spacing.one,
      maxWidth: 280,
    },
    clearFilterButton: {
      marginTop: Spacing.four,
      paddingHorizontal: Spacing.four,
      paddingVertical: Spacing.two,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearFilterText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.tealStrong,
    },
  });
}