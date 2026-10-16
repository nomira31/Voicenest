import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LandscapeScene } from "@/components/illustrations/LandScapeScene";
import { VoiceMark } from "@/components/illustrations/VoiceMark";
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
import { useAuth } from "@/contexts/auth-context";

export default function LoginScreen() {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const responsive = useResponsiveLayout();
  const styles = createStyles(colors, isDark, responsive);
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const sceneSize = Math.min(width * 0.92, 360);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validateForm() {
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleLogin() {
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const token = `dev-token-${Date.now()}`;
      await signIn(token);
    } catch (error) {
      Alert.alert(
        "Sign-in failed",
        "We couldn't sign you in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    Alert.alert(
      "Reset your password",
      "Connect your password-recovery flow to enable account recovery.",
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageWidth}>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.replace("/(onboarding)")}
                accessibilityRole="button"
                accessibilityLabel="Back to onboarding"
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>

              <View style={styles.brand}>
                <VoiceMark scale={0.42} color={colors.teal} />
                <Text style={styles.brandName}>VoiceNest</Text>
              </View>

              <View style={styles.topBarSpacer} />
            </View>

            {/* Hero & Artwork */}
            <View style={styles.hero}>
              <View style={styles.sceneCard}>
                <View style={styles.sceneArtwork}>
                  <LandscapeScene size={sceneSize} />
                </View>
                <View style={styles.sceneOverlay} />
                <View style={styles.sceneBadge}>
                  <Ionicons
                    name="volume-medium-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text style={styles.sceneBadgeText}>A moment to reconnect</Text>
                </View>
                <View style={styles.sceneCopy}>
                  <Text style={styles.sceneKicker}>SMALL VOICES. BIG MOMENTS.</Text>
                  <Text style={styles.sceneTitle}>Make room for what matters.</Text>
                </View>
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>YOUR VOICE, YOUR MOMENTS</Text>
                <Text style={styles.title}>Welcome back.</Text>
                <Text style={styles.description}>
                  Your favourite voices and meaningful moments are waiting for you.
                </Text>
              </View>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View
                  style={[
                    styles.inputContainer,
                    errors.email ? styles.inputError : null,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={colors.textTertiary}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (errors.email) {
                        setErrors((current) => ({ ...current, email: undefined }));
                      }
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    autoCorrect={false}
                    returnKeyType="next"
                    accessibilityLabel="Email address"
                  />
                </View>
                {errors.email ? (
                  <Text style={styles.errorText}>{errors.email}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.passwordHeader}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TouchableOpacity
                    onPress={handleForgotPassword}
                    accessibilityRole="button"
                    activeOpacity={0.6}
                  >
                    <Text style={styles.forgotPassword}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={[
                    styles.inputContainer,
                    errors.password ? styles.inputError : null,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={colors.textTertiary}
                  />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (errors.password) {
                        setErrors((current) => ({ ...current, password: undefined }));
                      }
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!showPassword}
                    autoComplete="current-password"
                    textContentType="password"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((value) => !value)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={19}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>
                {errors.password ? (
                  <Text style={styles.errorText}>{errors.password}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  isSubmitting && styles.loginButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={isSubmitting}
                accessibilityRole="button"
                activeOpacity={0.85}
              >
                <Text style={styles.loginButtonText}>
                  {isSubmitting ? "Signing in…" : "Log in"}
                </Text>
                {!isSubmitting && (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.textInverse}
                  />
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>New to VoiceNest? </Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Account creation",
                    "Connect your sign-up flow to create an account.",
                  )
                }
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                <Text style={styles.signupText}>Create an account</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.legalText}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: Theme, isDark: boolean, responsive: ReturnType<typeof useResponsiveLayout>) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const floatingShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;
  const landscapeLayout = responsive.isLandscape && (responsive.height < 520 || responsive.width >= 700);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: responsive.horizontalPadding,
      paddingBottom: Spacing.six,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },

    /* Top Bar */
    topBar: {
      minHeight: Layout.controlHeight,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.half,
    },
    backButton: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    brand: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
    },
    brandName: {
      ...Typography.headline,
      fontFamily: Fonts?.serif,
      fontSize: 20,
      lineHeight: 24,
      color: colors.textPrimary,
    },
    topBarSpacer: {
      width: Layout.iconButton,
    },

    /* Hero */
    hero: {
      paddingTop: Spacing.two,
      paddingBottom: responsive.isLandscape ? Spacing.three : Spacing.five,
      flexDirection: landscapeLayout ? "row" : "column",
      alignItems: landscapeLayout ? "stretch" : "center",
      gap: landscapeLayout ? Spacing.four : 0,
    },
    sceneCard: {
      height: landscapeLayout ? (responsive.height < 520 ? 142 : Math.min(230, responsive.height * 0.32)) : responsive.isCompact ? 148 : 164,
      flex: landscapeLayout ? 1 : undefined,
      borderRadius: Radius.xl,
      overflow: "hidden",
      backgroundColor: colors.surfaceSky,
      marginBottom: landscapeLayout ? 0 : Spacing.five,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    sceneArtwork: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: -112,
      alignItems: "center",
      opacity: 0.95,
    },
    sceneOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark
        ? "rgba(15, 26, 51, 0.28)"
        : "rgba(251, 246, 233, 0.16)",
    },
    sceneBadge: {
      position: "absolute",
      top: Spacing.three,
      right: Spacing.three,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.one + 2,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    sceneBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    sceneCopy: {
      position: "absolute",
      left: Spacing.four,
      right: Spacing.four,
      bottom: Spacing.four,
    },
    sceneKicker: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.3,
      color: colors.primary,
    },
    sceneTitle: {
      ...Typography.headline,
      fontFamily: Fonts?.serif,
      fontSize: 21,
      lineHeight: 26,
      marginTop: Spacing.half,
      color: colors.primary,
      maxWidth: 240,
    },
    heroCopy: {
      flex: landscapeLayout ? 1 : undefined,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.two,
      minWidth: 0,
    },
    eyebrow: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontWeight: "800",
      letterSpacing: 1.5,
      textAlign: "center",
      color: colors.tealStrong,
    },
    title: {
      ...Typography.display,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 28 : responsive.isTablet ? 36 : 32,
      lineHeight: responsive.isCompact ? 34 : responsive.isTablet ? 42 : 38,
      textAlign: "center",
      marginTop: Spacing.one,
      color: colors.textPrimary,
    },
    description: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: Spacing.two,
      color: colors.textSecondary,
      maxWidth: 320,
    },

    /* Form */
    form: {
      width: "100%",
      maxWidth: 500,
      alignSelf: "center",
      gap: responsive.isShort ? Spacing.three : Spacing.four,
    },
    fieldGroup: {
      gap: Spacing.one + 2,
    },
    fieldLabel: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      color: colors.textPrimary,
    },
    passwordHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    forgotPassword: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    inputContainer: {
      height: Layout.controlHeightLarge,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      paddingHorizontal: Spacing.four,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundElevated,
      ...cardShadow,
    },
    inputError: {
      borderColor: colors.danger,
    },
    input: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      color: colors.textPrimary,
    },
    errorText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      color: colors.danger,
      marginTop: 2,
    },
    loginButton: {
      height: Layout.controlHeightLarge,
      marginTop: Spacing.two,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      ...floatingShadow,
    },
    loginButtonDisabled: {
      opacity: 0.65,
    },
    loginButtonText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse,
    },

    /* Footer */
    footer: {
      marginTop: Spacing.six,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
    },
    footerText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textSecondary,
    },
    signupText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    legalText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      marginTop: Spacing.three,
      paddingHorizontal: Spacing.four,
      color: colors.textTertiary,
    },
  });
}