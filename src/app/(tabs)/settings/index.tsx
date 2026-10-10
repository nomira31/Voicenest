import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
import { useAuth } from "@/contexts/auth-context";

export default function ProfileScreen() {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const styles = createStyles(colors, isDark);
  const router = useRouter();
  const { signOut } = useAuth();

  const [notificationsActive, setNotificationsActive] = useState(true);

  function confirmSignOut() {
    Alert.alert(
      "Log out of VoiceNest?",
      "You'll need to sign in again to return to your moments.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: () => {
            void signOut()
              .then(() => router.replace("/(auth)/login"))
              .catch(() => Alert.alert("Couldn't log out", "Please try again."));
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageWidth}>
          {/* Top Bar with Settings Gear */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.gearButton}
              onPress={confirmSignOut}
              accessibilityRole="button"
              accessibilityLabel="Settings and account options"
              activeOpacity={0.7}
            >
              <Ionicons
                name="settings-outline"
                size={23}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* User Profile Info Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80",
                }}
                style={styles.avatarImage}
              />
            </View>

            <View style={styles.profileText}>
              <Text style={styles.userName}>Ibukun Bello</Text>
              <Text style={styles.userEmail}>ibukun@example.com</Text>
            </View>
          </View>

          {/* Premium Subscription Card */}
          <TouchableOpacity
            style={styles.premiumCard}
            onPress={() =>
              Alert.alert(
                "VoiceNest Premium",
                "Unlock unlimited recordings, enhanced AI audio processing, and cloud backup.",
              )
            }
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <View style={styles.crownContainer}>
              <MaterialCommunityIcons
                name="crown"
                size={24}
                color={colors.accentStrong}
              />
            </View>

            <View style={styles.premiumCopy}>
              <Text style={styles.premiumTitle}>Premium</Text>
              <Text style={styles.premiumDescription}>
                More recordings, higher AI usage and advanced features.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Settings / Menu List */}
          <View style={styles.menuList}>
            {/* Account & Security */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() =>
                Alert.alert(
                  "Account & Security",
                  "Manage your password, login sessions, and linked accounts.",
                )
              }
              accessibilityRole="button"
              activeOpacity={0.65}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>Account & Security</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>

            {/* Notifications */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setNotificationsActive((prev) => !prev);
              }}
              accessibilityRole="button"
              activeOpacity={0.65}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>Notifications</Text>
              <Text style={styles.menuValue}>
                {notificationsActive ? "On" : "Off"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>

            {/* Appearance */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() =>
                Alert.alert(
                  "Appearance",
                  "VoiceNest adapts to your system theme.",
                )
              }
              accessibilityRole="button"
              activeOpacity={0.65}
            >
              <Ionicons
                name="contrast-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>Appearance</Text>
              <Text style={styles.menuValue}>{isDark ? "Dark" : "Light"}</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>

            {/* Help & Support */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() =>
                Alert.alert(
                  "Help & Support",
                  "Reach out to customer care or read our quick start guides.",
                )
              }
              accessibilityRole="button"
              activeOpacity={0.65}
            >
              <Ionicons
                name="help-circle-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>Help & Support</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>

            {/* About */}
            <TouchableOpacity
              style={[styles.menuRow, styles.lastMenuRow]}
              onPress={() =>
                Alert.alert(
                  "About VoiceNest",
                  "VoiceNest Version 1.0.0\nSmall voices. Big moments.",
                )
              }
              accessibilityRole="button"
              activeOpacity={0.65}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>About</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: Theme, isDark: boolean) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: Layout.screenHorizontal,
      paddingTop: Spacing.one,
      paddingBottom: Spacing.eight,
    },
    pageWidth: {
      width: "100%",
      maxWidth: Layout.contentMaxWidth,
      alignSelf: "center",
    },

    /* Top Bar */
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      marginTop: Spacing.half,
      marginBottom: Spacing.two,
    },
    gearButton: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      alignItems: "flex-end",
      justifyContent: "center",
    },

    /* Profile Header */
    profileHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.four,
      marginBottom: Spacing.six,
      paddingHorizontal: Spacing.half,
    },
    avatarContainer: {
      width: 68,
      height: 68,
      borderRadius: Radius.pill,
      overflow: "hidden",
      backgroundColor: colors.surfaceSky,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    avatarImage: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    profileText: {
      flex: 1,
      minWidth: 0,
    },
    userName: {
      ...Typography.headline,
      fontFamily: Fonts?.sans,
      fontSize: 20,
      lineHeight: 25,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: colors.primary,
    },
    userEmail: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      lineHeight: 18,
      marginTop: Spacing.half,
      color: colors.teal,
    },

    /* Premium Banner Card */
    premiumCard: {
      minHeight: 88,
      paddingHorizontal: Spacing.four,
      paddingVertical: Spacing.four,
      borderRadius: Radius.xl,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      backgroundColor: isDark ? colors.surfaceYellow : "#FFF4DE",
      borderWidth: 1,
      borderColor: isDark ? colors.border : "#F3E3C3",
      marginBottom: Spacing.six,
      ...cardShadow,
    },
    crownContainer: {
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    premiumCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: Spacing.one,
    },
    premiumTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700",
      color: colors.primary,
    },
    premiumDescription: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
      color: colors.textSecondary,
    },

    /* Menu / Settings Rows */
    menuList: {
      width: "100%",
    },
    menuRow: {
      minHeight: 56,
      paddingVertical: Spacing.three,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    lastMenuRow: {
      borderBottomWidth: 0,
    },
    menuLabel: {
      ...Typography.bodyMedium,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
      flex: 1,
      marginLeft: Spacing.three + 2,
    },
    menuValue: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "500",
      color: colors.textSecondary,
      marginRight: Spacing.two,
    },
  });
}