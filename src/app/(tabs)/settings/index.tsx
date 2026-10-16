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
  useThemePreference,
  type Theme,
} from "@/constants/theme";
import { useRecordings } from "@/contexts/recordings-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const colors = useAppTheme();
  const { preference, resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === "dark";
  const responsive = useResponsiveLayout();
  const styles = makeStyles(colors, isDark, responsive);
  const router = useRouter();
  const { recordings } = useRecordings();
  const { dialog, showAlert } = useAppDialog();

  const themeLabel =
    preference === "system"
      ? `System (${isDark ? "Dark" : "Light"})`
      : preference === "dark"
        ? "Dark"
        : "Light";

  return (
    <>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageWidth}>
            <Text style={styles.pageTitle}>Profile & Settings</Text>

            <View style={styles.profileCard}>
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80",
                }}
                style={styles.avatar}
              />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>Ibukun</Text>
                <Text style={styles.profileSub}>
                  {recordings.length} voice moment{recordings.length === 1 ? "" : "s"} saved
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.cardGroup}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => router.push("/settings/theme" as any)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Theme settings"
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.surfaceYellow }]}>
                  <Ionicons
                    name={isDark ? "moon-outline" : "sunny-outline"}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Theme</Text>
                  <Text style={styles.rowSubtitle}>
                    Choose System, Light, or Dark appearance
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>{themeLabel}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color={colors.textTertiary}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => router.push("/(tabs)/schedule")}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.surfaceTeal }]}>
                  <Ionicons name="alarm-outline" size={20} color={colors.tealStrong} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Wake-up Alarms</Text>
                  <Text style={styles.rowSubtitle}>
                    Manage scheduled voice alarms & permissions
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => router.push("/(tabs)/library")}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSage }]}>
                  <Ionicons name="library-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Voice Library & Tags</Text>
                  <Text style={styles.rowSubtitle}>
                    Browse all saved recordings and custom tags
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.cardGroup}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() =>
                  void showAlert(
                    "VoiceNest",
                    "Your personal space for voice moments, affirmations, and gentle wake-up alarms.",
                  )
                }
                activeOpacity={0.8}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSky }]}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>About VoiceNest</Text>
                  <Text style={styles.rowSubtitle}>Version 1.0.0</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
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
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.two,
      paddingBottom: Spacing.eight + 80,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    pageTitle: {
      ...Typography.display,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 27 : 32,
      color: colors.textPrimary,
      marginBottom: Spacing.four,
    },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.five,
      ...cardShadow,
    },
    avatar: {
      width: 60,
      height: 60,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    profileInfo: { flex: 1 },
    profileName: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 20,
      color: colors.textPrimary,
    },
    profileSub: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sectionTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: Spacing.two,
      marginTop: Spacing.two,
    },
    cardGroup: {
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.four,
      overflow: "hidden",
      ...cardShadow,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.four,
      minHeight: Layout.minTouchTarget,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rowSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowValue: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 68,
    },
  });
}