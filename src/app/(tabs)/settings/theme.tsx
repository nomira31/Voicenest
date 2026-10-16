import {
    Colors,
    Fonts,
    Layout,
    Radius,
    Shadows,
    Spacing,
    Typography,
    useAppTheme,
    useResponsiveLayout,
    useThemePreference,
    type Theme,
    type ThemePreference,
} from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const THEME_OPTIONS: {
  id: ThemePreference;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: "system",
    title: "System",
    subtitle: "Automatically switch between Light and Dark to match your device settings.",
    icon: "phone-portrait-outline",
  },
  {
    id: "light",
    title: "Light",
    subtitle: "Warm sunlit ivory paper with deep navy typography and soft sage accents.",
    icon: "sunny-outline",
  },
  {
    id: "dark",
    title: "Dark",
    subtitle: "Calm twilight indigo with glowing sunrise gold controls for low-light comfort.",
    icon: "moon-outline",
  },
];

const PREVIEW_WAVE = [10, 18, 26, 16, 30, 22, 14, 28, 20, 12, 24, 16];

export default function ThemeSettingsScreen() {
  const router = useRouter();
  const colors = useAppTheme();
  const { preference, resolvedScheme, setPreference } = useThemePreference();
  const isDark = resolvedScheme === "dark";
  const responsive = useResponsiveLayout();
  const styles = makeStyles(colors, isDark, responsive);

  const previewColors = Colors[resolvedScheme];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Appearance</Text>
          <View style={styles.backSpacer} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageWidth}>
          <View style={styles.previewSectionHeader}>
            <Text style={styles.sectionEyebrow}>LIVE PREVIEW</Text>
            <View style={styles.activeModeBadge}>
              <Ionicons
                name={isDark ? "moon" : "sunny"}
                size={12}
                color={colors.tealStrong}
              />
              <Text style={styles.activeModeBadgeText}>
                {preference === "system"
                  ? `System (${isDark ? "Dark" : "Light"})`
                  : preference === "dark"
                    ? "Dark Mode"
                    : "Light Mode"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.previewStageCard,
              {
                backgroundColor: previewColors.background,
                borderColor: previewColors.borderStrong,
              },
            ]}
          >
            <View style={styles.previewWindowHeader}>
              <View style={styles.previewGreetingCol}>
                <View style={styles.previewEyebrowRow}>
                  <MaterialCommunityIcons
                    name={isDark ? "moon-waning-crescent" : "weather-sunset-up"}
                    size={13}
                    color={isDark ? previewColors.sky : previewColors.accentStrong}
                  />
                  <Text
                    style={[
                      styles.previewEyebrow,
                      { color: previewColors.tealStrong },
                    ]}
                  >
                    VOICENEST PREVIEW
                  </Text>
                </View>
                <Text
                  style={[
                    styles.previewHeading,
                    { color: previewColors.textPrimary },
                  ]}
                >
                  {isDark ? "Good evening, Ibukun" : "Good morning, Ibukun"}
                </Text>
                <Text
                  style={[
                    styles.previewSubheading,
                    { color: previewColors.textSecondary },
                  ]}
                >
                  Your voice. Your moments.
                </Text>
              </View>

              <View
                style={[
                  styles.previewMicPill,
                  {
                    backgroundColor: previewColors.surfaceYellow,
                    borderColor: previewColors.border,
                  },
                ]}
              >
                <Ionicons name="mic" size={16} color={previewColors.primary} />
              </View>
            </View>

            <View
              style={[
                styles.previewVoiceCard,
                {
                  backgroundColor: previewColors.backgroundElevated,
                  borderColor: previewColors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.previewThumb,
                  {
                    backgroundColor: previewColors.surfaceSage,
                    borderColor: previewColors.border,
                  },
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={17}
                  color={previewColors.primary}
                />
              </View>

              <View style={styles.previewVoiceMeta}>
                <Text
                  style={[
                    styles.previewVoiceTitle,
                    { color: previewColors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  Morning Affirmation
                </Text>
                <View style={styles.previewTagRow}>
                  <View
                    style={[
                      styles.previewMiniTag,
                      { backgroundColor: previewColors.surfaceTeal },
                    ]}
                  >
                    <Text
                      style={[
                        styles.previewMiniTagText,
                        { color: previewColors.tealStrong },
                      ]}
                    >
                      Motivation
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.previewDuration,
                      { color: previewColors.textSecondary },
                    ]}
                  >
                    0:42
                  </Text>
                </View>
              </View>

              <View style={styles.previewWaveRow}>
                {PREVIEW_WAVE.map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.previewWaveBar,
                      {
                        height: h,
                        backgroundColor:
                          i < 7 ? previewColors.tealStrong : previewColors.borderStrong,
                      },
                    ]}
                  />
                ))}
              </View>

              <View
                style={[
                  styles.previewPlayBtn,
                  { backgroundColor: previewColors.primary },
                ]}
              >
                <Ionicons
                  name="play"
                  size={12}
                  color={previewColors.textInverse}
                />
              </View>
            </View>

            <View style={styles.previewPaletteSwatches}>
              {[
                { label: "Surface", color: previewColors.backgroundElevated },
                { label: "Primary", color: previewColors.primary },
                { label: "Sunrise", color: previewColors.accent },
                { label: "Sage", color: previewColors.surfaceSage },
                { label: "Teal", color: previewColors.tealStrong },
              ].map((swatch) => (
                <View key={swatch.label} style={styles.swatchItem}>
                  <View
                    style={[
                      styles.swatchDot,
                      {
                        backgroundColor: swatch.color,
                        borderColor: previewColors.borderStrong,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.swatchLabel,
                      { color: previewColors.textSecondary },
                    ]}
                  >
                    {swatch.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.optionsSectionTitle}>Choose Theme</Text>

          <View style={styles.optionsList}>
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.optionCard,
                    selected && styles.optionCardSelected,
                  ]}
                  onPress={() => setPreference(option.id)}
                  activeOpacity={0.82}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.optionIconBox,
                      selected && styles.optionIconBoxSelected,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={21}
                      color={selected ? colors.textInverse : colors.primary}
                    />
                  </View>

                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                  </View>

                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={23}
                    color={selected ? colors.primary : colors.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    topBar: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingVertical: Spacing.two,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    topBarInner: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backButton: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    backSpacer: {
      width: Layout.iconButton,
      height: Layout.iconButton,
    },
    pageTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 20,
      color: colors.textPrimary,
    },
    content: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.four,
      paddingBottom: Spacing.ten,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    previewSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.two,
    },
    sectionEyebrow: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: colors.textSecondary,
    },
    activeModeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: Spacing.two + 2,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1,
      borderColor: colors.border,
    },
    activeModeBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    previewStageCard: {
      width: "100%",
      borderRadius: Radius.xl,
      borderWidth: 1.5,
      padding: Spacing.four,
      marginBottom: Spacing.six,
      ...cardShadow,
    },
    previewWindowHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: Spacing.four,
    },
    previewGreetingCol: {
      flex: 1,
    },
    previewEyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 4,
    },
    previewEyebrow: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
    },
    previewHeading: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 21,
      lineHeight: 26,
    },
    previewSubheading: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      marginTop: 2,
    },
    previewMicPill: {
      width: 38,
      height: 38,
      borderRadius: Radius.pill,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    previewVoiceCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: Radius.lg,
      borderWidth: 1,
    },
    previewThumb: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    previewVoiceMeta: {
      flex: 1,
      minWidth: 0,
    },
    previewVoiceTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "700",
    },
    previewTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    previewMiniTag: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.pill,
    },
    previewMiniTagText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 9,
      fontWeight: "700",
    },
    previewDuration: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 10,
    },
    previewWaveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      height: 32,
    },
    previewWaveBar: {
      width: 2.5,
      borderRadius: Radius.pill,
    },
    previewPlayBtn: {
      width: 30,
      height: 30,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    previewPaletteSwatches: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: Spacing.four,
      paddingTop: Spacing.three,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(138, 150, 171, 0.25)",
    },
    swatchItem: {
      alignItems: "center",
      gap: 4,
    },
    swatchDot: {
      width: 20,
      height: 20,
      borderRadius: Radius.pill,
      borderWidth: 1,
    },
    swatchLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
    },
    optionsSectionTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: Spacing.three,
    },
    optionsList: {
      gap: Spacing.three,
    },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    optionCardSelected: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    optionIconBox: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    optionIconBoxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionCopy: {
      flex: 1,
      minWidth: 0,
    },
    optionTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    optionSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
}