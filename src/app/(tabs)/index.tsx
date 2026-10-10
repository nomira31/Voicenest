import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Fonts,
  Layout,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
  type Theme,
} from "@/constants/theme";
import { useRecordingModal } from "@/contexts/recording-modal-context";
import { useRecordings } from "@/contexts/recordings-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type DayPart = {
  greeting: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

function getDayPart(date = new Date()): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return { greeting: "Good morning", icon: "weather-sunset-up" };
  if (hour >= 12 && hour < 17) return { greeting: "Good afternoon", icon: "white-balance-sunny" };
  if (hour >= 17 && hour < 21) return { greeting: "Good evening", icon: "weather-sunset-down" };
  return { greeting: "Good night", icon: "moon-waning-crescent" };
}

function getDayPartColor(icon: DayPart["icon"], colors: Theme) {
  switch (icon) {
    case "weather-sunset-up": return colors.accentStrong;
    case "white-balance-sunny": return colors.accent;
    case "weather-sunset-down": return colors.accentWarm;
    default: return colors.sky;
  }
}

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
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function HomeScreen() {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const styles = createStyles(colors, isDark);
  const router = useRouter();
  const { openRecordModal } = useRecordingModal();
  const { recordings, playRecording, currentPlayingId, isPlaying } = useRecordings();
  const { dialog, showAlert } = useAppDialog();

  const now = new Date();
  const { greeting, icon: dayIcon } = getDayPart(now);
  const dayIconColor = getDayPartColor(dayIcon, colors);
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).toUpperCase();

  function handleQuickAction(id: string) {
    if (id === "record") {
      openRecordModal();
      return;
    }
    void showAlert("Coming soon", "This feature is on the roadmap.");
  }

  const recentList = recordings.slice(0, 3);

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.pageWidth}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <View style={styles.eyebrowRow}>
                  <MaterialCommunityIcons name={dayIcon} size={14} color={dayIconColor} />
                  <Text style={styles.eyebrow}>{dateLabel}</Text>
                </View>
                <Text style={styles.greeting}>{greeting}, Ibukun</Text>
                <Text style={styles.subtitle}>Your voice. Your moments.</Text>
              </View>

              <TouchableOpacity
                style={styles.avatar}
                onPress={() => router.push("/(tabs)/settings")}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80" }}
                  style={styles.avatarImage}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.searchBox}
              onPress={() => router.push("/(tabs)/library")}
              activeOpacity={0.7}
            >
              <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
              <Text style={styles.searchPlaceholder}>Search your recordings...</Text>
            </TouchableOpacity>

            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surfaceYellow }]}
                onPress={() => handleQuickAction("record")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.backgroundElevated }]}>
                  <Ionicons name="mic-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.quickText}>
                  <Text style={styles.quickTitle}>Record a voice</Text>
                  <Text style={styles.quickCaption}>Capture a thought</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surfaceSky }]}
                onPress={() => handleQuickAction("ai")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.backgroundElevated }]}>
                  <Ionicons name="sparkles-outline" size={20} color={colors.tealStrong} />
                </View>
                <View style={styles.quickText}>
                  <Text style={styles.quickTitle}>AI voice</Text>
                  <Text style={styles.quickCaption}>Bring words to life</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surfaceSage }]}
                onPress={() => handleQuickAction("import")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.backgroundElevated }]}>
                  <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.quickText}>
                  <Text style={styles.quickTitle}>Import audio</Text>
                  <Text style={styles.quickCaption}>Keep it all close</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surfaceTeal }]}
                onPress={() => handleQuickAction("request")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.backgroundElevated }]}>
                  <Ionicons name="people-outline" size={20} color={colors.tealStrong} />
                </View>
                <View style={styles.quickText}>
                  <Text style={styles.quickTitle}>Request a voice</Text>
                  <Text style={styles.quickCaption}>Invite someone in</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeaderSpaced}>
              <Text style={styles.sectionTitle}>Recent voice moments</Text>
              <TouchableOpacity style={styles.textAction} onPress={() => router.push("/(tabs)/library")}>
                <Text style={styles.textActionLabel}>See all ({recordings.length})</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.tealStrong} />
              </TouchableOpacity>
            </View>

            <View style={styles.upcomingList}>
              {recentList.map((item) => {
                const activeThis = currentPlayingId === item.id && isPlaying;
                return (
                  <View key={item.id} style={styles.upcomingCard}>
                    <View style={[styles.upcomingIcon, { backgroundColor: colors[item.surface] }]}>
                      <Ionicons name={item.icon as any} size={20} color={colors.primary} />
                    </View>
                    <View style={styles.upcomingInfo}>
                      <Text style={styles.upcomingTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.upcomingTime}>{formatDate(item.createdAt)}</Text>
                      <Text style={styles.upcomingDetail}>{formatDuration(item.durationMillis)}</Text>
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
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {recentList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No voice recordings yet. Tap 'Record a voice' to start.</Text>
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

function createStyles(colors: Theme, isDark: boolean) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: Layout.screenHorizontal, paddingTop: Spacing.two, paddingBottom: Spacing.eight + 88 },
    pageWidth: { width: "100%", maxWidth: Layout.contentMaxWidth, alignSelf: "center" },
    header: { paddingTop: Spacing.one, marginBottom: Spacing.five, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: Spacing.three },
    headerText: { flex: 1, minWidth: 0 },
    eyebrowRow: { flexDirection: "row", alignItems: "center", gap: Spacing.one, marginBottom: Spacing.one },
    eyebrow: { ...Typography.caption, fontFamily: Fonts?.sans, letterSpacing: 1.2, fontWeight: "700", color: colors.tealStrong },
    greeting: { ...Typography.display, fontFamily: Fonts?.serif, color: colors.textPrimary },
    subtitle: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 13, lineHeight: 18, marginTop: Spacing.half, color: colors.textSecondary },
    avatar: { width: Layout.iconButton, height: Layout.iconButton, borderRadius: Radius.pill, overflow: "hidden", backgroundColor: colors.surfaceSky, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    avatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
    searchBox: { height: Layout.controlHeight, paddingHorizontal: Spacing.four, borderRadius: Radius.xl, flexDirection: "row", alignItems: "center", gap: Spacing.two, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.five, ...cardShadow },
    searchPlaceholder: { ...Typography.body, fontFamily: Fonts?.sans, fontSize: 14, color: colors.textTertiary, flex: 1 },
    quickActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: Spacing.three, marginBottom: Spacing.six },
    quickCard: { width: "48.5%", minHeight: 84, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, borderRadius: Radius.lg, flexDirection: "row", alignItems: "center", gap: Spacing.two, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    quickIcon: { width: 38, height: 38, borderRadius: Radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    quickText: { flex: 1, minWidth: 0, justifyContent: "center" },
    quickTitle: { ...Typography.caption, fontFamily: Fonts?.sans, fontWeight: "700", fontSize: 12, lineHeight: 16, color: colors.textPrimary },
    quickCaption: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 10, lineHeight: 14, marginTop: 2, color: colors.textSecondary },
    sectionHeaderSpaced: { marginBottom: Spacing.three, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.three },
    sectionTitle: { ...Typography.headline, fontFamily: Fonts?.serif, fontSize: 21, lineHeight: 26, color: colors.textPrimary },
    textAction: { flexDirection: "row", alignItems: "center", gap: Spacing.half, paddingVertical: Spacing.one, minHeight: Layout.minTouchTarget, justifyContent: "center" },
    textActionLabel: { ...Typography.caption, fontFamily: Fonts?.sans, fontWeight: "700", color: colors.tealStrong },
    upcomingList: { gap: Spacing.three },
    upcomingCard: { minHeight: 80, padding: Spacing.three, borderRadius: Radius.lg, flexDirection: "row", alignItems: "center", gap: Spacing.three, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    upcomingIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    upcomingInfo: { flex: 1, minWidth: 0 },
    upcomingTitle: { ...Typography.label, fontFamily: Fonts?.sans, fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    upcomingTime: { ...Typography.caption, fontFamily: Fonts?.sans, fontWeight: "700", marginTop: 2, color: colors.tealStrong },
    upcomingDetail: { ...Typography.caption, fontFamily: Fonts?.sans, marginTop: 2, color: colors.textSecondary },
    playButton: { width: 34, height: 34, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundSubtle, borderWidth: 1, borderColor: colors.border },
    emptyContainer: { padding: Spacing.six, alignItems: "center", justifyContent: "center", borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
    emptyText: { ...Typography.body, fontFamily: Fonts?.sans, fontSize: 13, color: colors.textTertiary, textAlign: "center" },
  });
}
