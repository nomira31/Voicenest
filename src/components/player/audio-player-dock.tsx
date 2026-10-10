import {
  Fonts,
  Layout,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
} from "@/constants/theme";
import { useRecordings } from "@/contexts/recordings-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import React from "react";
import {
  BackHandler,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface AudioPlayerDockProps {
  /** Position the collapsed player above the app's tab bar. Adjust for a custom tab-bar height. */
  bottomOffset?: number;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

const ART_BARS = [14, 28, 20, 36, 45, 25, 52, 30, 42, 18, 34, 48, 24, 39, 18, 30, 46, 22, 37, 16, 28, 44, 31, 20, 38];

export default function AudioPlayerDock({ bottomOffset = 78 }: AudioPlayerDockProps) {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const styles = makeStyles(colors, isDark, bottomOffset);
  const {
    recordings,
    currentPlayingId,
    isPlaying,
    playbackPositionSeconds,
    playbackDurationSeconds,
    isPlayerExpanded,
    expandPlayer,
    collapsePlayer,
    closePlayer,
    togglePlayback,
    seekPlayback,
  } = useRecordings();

  const track = recordings.find((item) => item.id === currentPlayingId) ?? null;

  const duration = playbackDurationSeconds > 0
    ? playbackDurationSeconds
    : Math.max(0, (track?.durationMillis ?? 0) / 1000);
  const position = Math.max(0, Math.min(playbackPositionSeconds, duration || playbackPositionSeconds));
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const handleSeek = (seconds: number) => {
    if (typeof seekPlayback !== "function") {
      console.warn(
        "Audio player seeking is unavailable. Replace src/contexts/recordings-context.tsx with the updated shared-player context."
      );
      return;
    }
    void seekPlayback(seconds);
  };

  const handleExpand = () => {
    if (typeof expandPlayer === "function") expandPlayer();
  };

  const handleCollapse = () => {
    if (typeof collapsePlayer === "function") collapsePlayer();
  };

  React.useEffect(() => {
    if (!isPlayerExpanded) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (typeof collapsePlayer === "function") collapsePlayer();
      return true;
    });
    return () => subscription.remove();
  }, [isPlayerExpanded, collapsePlayer]);

  if (!track) return null;

  return (
    <>
      {!isPlayerExpanded ? (
        <View style={styles.dockPosition} pointerEvents="box-none">
          <View style={styles.miniPlayer}>
            <Pressable
              onPress={handleExpand}
              accessibilityRole="button"
              accessibilityLabel={`Open player for ${track.title}`}
              style={({ pressed }) => [styles.miniTrackArea, pressed && styles.pressed]}
            >
              <View style={styles.miniArtwork}>
                <MaterialCommunityIcons name="waveform" size={22} color={colors.textInverse} />
              </View>
              <View style={styles.miniTrackText}>
                <Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.miniSubtitle} numberOfLines={1}>{track.category} · Voice moment</Text>
              </View>
            </Pressable>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause recording" : "Play recording"}
              style={styles.miniControl}
              onPress={togglePlayback}
              activeOpacity={0.7}
            >
              <Ionicons name={isPlaying ? "pause" : "play"} size={21} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close player"
              style={styles.miniClose}
              onPress={closePlayer}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={19} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.miniProgressTrack}>
              <View style={[styles.miniProgressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
      ) : null}

      {isPlayerExpanded ? (
        <View style={styles.expandedOverlay}>
          <StatusBar
            hidden={false}
            barStyle={isDark ? "light-content" : "dark-content"}
            backgroundColor={colors.background}
            translucent={false}
          />
          <SafeAreaView style={styles.fullPlayer} edges={["top", "bottom"]}>
          <View style={styles.playerTopBar}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Collapse player"
              hitSlop={12}
              onPress={handleCollapse}
              style={styles.topIconButton}
            >
              <Ionicons name="chevron-down" size={25} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.nowPlayingLabelWrap}>
              <Text style={styles.nowPlayingLabel}>NOW PLAYING</Text>
              <Text style={styles.nowPlayingSubLabel}>YOUR VOICE LIBRARY</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close player"
              hitSlop={12}
              onPress={closePlayer}
              style={styles.topIconButton}
            >
              <Ionicons name="close" size={23} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.playerBody}>
            <View style={styles.heroArtwork}>
              <View style={styles.heroArtworkCircleOne} />
              <View style={styles.heroArtworkCircleTwo} />
              <View style={styles.heroWaveform}>
                {ART_BARS.map((height, index) => (
                  <View
                    key={index}
                    style={[
                      styles.heroBar,
                      { height, opacity: index / ART_BARS.length <= progress ? 1 : 0.42 },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.heroMicBadge}>
                <Ionicons name="mic" size={24} color={colors.textInverse} />
              </View>
            </View>

            <View style={styles.trackHeading}>
              <View style={styles.trackHeadingText}>
                <Text style={styles.fullTrackTitle} numberOfLines={2}>{track.title}</Text>
                <Text style={styles.fullTrackSubtitle}>{track.category} · Saved voice moment</Text>
              </View>
              <View style={styles.playingBadge}>
                <Ionicons name="volume-high" size={16} color={colors.tealStrong} />
              </View>
            </View>

            <View style={styles.progressArea}>
              <Slider
                style={styles.progressSlider}
                minimumValue={0}
                maximumValue={Math.max(duration, 0.01)}
                value={Math.min(position, Math.max(duration, 0.01))}
                onSlidingComplete={(value) => handleSeek(value)}
                minimumTrackTintColor={colors.tealStrong}
                maximumTrackTintColor={colors.borderStrong}
                thumbTintColor={colors.tealStrong}
                disabled={duration <= 0}
              />
              <View style={styles.timeLabels}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>

            <View style={styles.mainControls}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back 15 seconds"
                style={styles.skipControl}
                onPress={() => handleSeek(position - 15)}
              >
                <MaterialCommunityIcons name="rewind-15" size={29} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? "Pause recording" : "Play recording"}
                style={styles.mainPlayButton}
                onPress={togglePlayback}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={30}
                  color={colors.textInverse}
                  style={!isPlaying ? styles.playIconNudge : undefined}
                />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Forward 15 seconds"
                style={styles.skipControl}
                onPress={() => handleSeek(position + 15)}
              >
                <MaterialCommunityIcons name="fast-forward-15" size={29} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.footerActions}>
              <View style={styles.footerActionItem}>
                <Ionicons name="headset-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.footerActionText}>Personal audio</Text>
              </View>
              <Text style={styles.speedLabel}>1×</Text>
            </View>
          </View>
          </SafeAreaView>
        </View>
      ) : null}
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useAppTheme>, isDark: boolean, bottomOffset: number) {
  const cardShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;

  return StyleSheet.create({
    dockPosition: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: bottomOffset,
      zIndex: 100,
      elevation: 20,
    },
    miniPlayer: {
      minHeight: 65,
      borderRadius: Radius.lg,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: Spacing.two,
      paddingRight: Spacing.one,
      ...cardShadow,
      overflow: "hidden",
    },
    miniTrackArea: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      paddingVertical: Spacing.two,
    },
    miniArtwork: {
      width: 43,
      height: 43,
      borderRadius: Radius.md,
      backgroundColor: colors.tealStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    miniTrackText: { flex: 1, minWidth: 0 },
    miniTitle: {
      ...Typography.bodyMedium,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    miniSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      marginTop: 2,
      color: colors.textSecondary,
    },
    miniControl: { width: 40, height: 48, alignItems: "center", justifyContent: "center" },
    miniClose: { width: 32, height: 48, alignItems: "center", justifyContent: "center" },
    miniProgressTrack: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: colors.border,
    },
    miniProgressFill: { height: "100%", backgroundColor: colors.tealStrong },
    expandedOverlay: {
        position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: colors.background,
    },
    fullPlayer: { flex: 1, backgroundColor: colors.background },
    playerTopBar: {
      paddingHorizontal: Layout.screenHorizontal,
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topIconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
    nowPlayingLabelWrap: { alignItems: "center", gap: 3 },
    nowPlayingLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      letterSpacing: 1.4,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    nowPlayingSubLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 8,
      letterSpacing: 1.6,
      fontWeight: "700",
      color: colors.textTertiary,
    },
    playerBody: {
      flex: 1,
      paddingHorizontal: Layout.screenHorizontal,
      paddingTop: Spacing.four,
      paddingBottom: Spacing.six,
      justifyContent: "space-evenly",
    },
    heroArtwork: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 310,
      aspectRatio: 1,
      borderRadius: Radius.xl,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#172B2A" : "#DDEBE1",
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroArtworkCircleOne: {
      position: "absolute",
      width: "95%",
      aspectRatio: 1,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: isDark ? "rgba(198, 229, 205, 0.12)" : "rgba(40, 87, 65, 0.12)",
    },
    heroArtworkCircleTwo: {
      position: "absolute",
      width: "72%",
      aspectRatio: 1,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: isDark ? "rgba(198, 229, 205, 0.2)" : "rgba(40, 87, 65, 0.18)",
    },
    heroWaveform: {
      width: "76%",
      height: 90,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    heroBar: {
      flex: 1,
      maxWidth: 6,
      borderRadius: Radius.pill,
      backgroundColor: isDark ? "#B9DBC5" : "#2F6B50",
    },
    heroMicBadge: {
      position: "absolute",
      bottom: 23,
      right: 23,
      width: 48,
      height: 48,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tealStrong,
      borderWidth: 3,
      borderColor: isDark ? "#172B2A" : "#DDEBE1",
    },
    trackHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      marginTop: Spacing.four,
    },
    trackHeadingText: { flex: 1, minWidth: 0 },
    fullTrackTitle: {
      ...Typography.headline,
      fontFamily: Fonts?.serif,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    fullTrackSubtitle: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      marginTop: 4,
      color: colors.textSecondary,
    },
    playingBadge: {
      width: 38,
      height: 38,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(92, 138, 113, 0.16)" : "rgba(92, 138, 113, 0.1)",
    },
    progressArea: { marginTop: Spacing.two },
    progressSlider: { width: "100%", height: 34 },
    timeLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
    timeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontVariant: ["tabular-nums"],
      color: colors.textSecondary,
      fontSize: 11,
    },
    mainControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.eight,
      marginTop: Spacing.three,
    },
    skipControl: { width: 48, height: 54, alignItems: "center", justifyContent: "center" },
    mainPlayButton: {
      width: 70,
      height: 70,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tealStrong,
      ...cardShadow,
    },
    playIconNudge: { marginLeft: 4 },
    footerActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: Spacing.three,
    },
    footerActionItem: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
    footerActionText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      color: colors.textSecondary,
      fontSize: 11,
    },
    speedLabel: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      color: colors.textSecondary,
      fontSize: 12,
    },
    pressed: { opacity: 0.75 },
  });
}
