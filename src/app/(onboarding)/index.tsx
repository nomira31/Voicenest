import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  LandLayer,
  SCENE_CANVAS,
  SUN_HIDDEN_OFFSET,
  SkyLayer,
  SunLayer,
} from "@/components/illustrations/LandScapeScene";
import {
  VOICE_MARK_BARS,
  VoiceMark,
} from "@/components/illustrations/VoiceMark";
import { Radius, Spacing, useAppTheme, useResponsiveLayout, type Theme } from "@/constants/theme";
import { useOnboarding } from "@/contexts/onboarding-context";

type SlideVisual = "intention" | "voice" | "rhythm";

type OnboardingSlide = {
  eyebrow: string;
  title: string;
  description: string;
  visual: SlideVisual;
};

/**
 * The welcome page is the only page that uses the landscape scene.
 * Content slides use compact, purpose-built visual cards so the copy stays
 * readable and the design still feels warm, branded, and intentional.
 */
const slides: OnboardingSlide[] = [
  {
    eyebrow: "A MOMENT FOR YOU",
    title: "Step into your day with intention.",
    description: "Begin with words that build you, and carry them into your day.",
    visual: "intention",
  },
  {
    eyebrow: "YOUR VOICE, YOUR MOMENT",
    title: "Your voice. Your moment.",
    description:
      "Record a message in your own voice, or invite someone you trust to record something uplifting, and decide when you want to hear it.",
    visual: "voice",
  },
  {
    eyebrow: "MAKE IT YOURS",
    title: "Make encouragement part of your rhythm.",
    description:
      "Choose when to hear your message. A gentle morning reminder or a thoughtful note later in the day can give you a moment that feels like yours.",
    visual: "rhythm",
  },
];

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const WAVEFORM = [11, 19, 28, 15, 24, 34, 20, 13, 31, 39, 22, 15, 30, 23, 36, 17, 27, 13, 21, 31, 17, 10];

function reveal(value: Animated.Value, delay: number, duration: number) {
  return Animated.timing(value, {
    toValue: 1,
    delay,
    duration,
    easing: EASE_OUT,
    useNativeDriver: true,
  });
}

function settle(value: Animated.Value) {
  Animated.spring(value, {
    toValue: 0,
    speed: 22,
    bounciness: 2,
    useNativeDriver: true,
  }).start();
}

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useAppTheme();
  const { width, height } = useWindowDimensions();
  const responsive = useResponsiveLayout();
  const { completeOnboarding } = useOnboarding();

  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepRef = useRef(step);
  stepRef.current = step;
  const directionRef = useRef(1);
  const dragX = useRef(new Animated.Value(0)).current;

  // Welcome/splash entrance animation.
  const bars = useMemo(
    () => VOICE_MARK_BARS.map(() => new Animated.Value(0)),
    [],
  );
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const sunProgress = useRef(new Animated.Value(0)).current;
  const welcomeActionsOpacity = useRef(new Animated.Value(0)).current;
  const welcomeActionsY = useRef(new Animated.Value(14)).current;
  const slideProgress = useRef(new Animated.Value(0)).current;
  const welcomeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const sceneSize = responsive.isLandscape ? Math.min(width, height * 1.45) : width;
  const compact = height < 700 || responsive.isLandscape;
  const visualHeight = responsive.isLandscape
    ? Math.max(174, Math.min(248, height * 0.42))
    : Math.max(174, Math.min(compact ? 204 : 232, height * 0.30));
  const styles = createStyles(colors, { width, height, visualHeight, isLandscape: responsive.isLandscape, isCompact: responsive.isCompact, isTablet: responsive.isTablet });
  const currentSlide = slides[step];
  const isLastStep = step === slides.length - 1;

  // Horizontal swipes page the onboarding; vertical gestures remain available
  // to ScrollView on shorter screens.
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
        onPanResponderMove: (_event, gesture) => {
          dragX.setValue(Math.max(-width * 0.82, Math.min(width * 0.82, gesture.dx)));
        },
        onPanResponderRelease: (_event, gesture) => {
          const current = stepRef.current;
          const threshold = Math.max(48, width * 0.14);
          const forward = (gesture.dx < -threshold || gesture.vx < -0.55) && current < slides.length - 1;
          const backward = (gesture.dx > threshold || gesture.vx > 0.55) && current > 0;

          if (forward || backward) {
            directionRef.current = forward ? 1 : -1;
            dragX.stopAnimation();
            dragX.setValue(0);
            setError(null);
            setStep(Math.max(0, Math.min(slides.length - 1, current + (forward ? 1 : -1))));
          } else {
            settle(dragX);
          }
        },
        onPanResponderTerminate: () => settle(dragX),
      }),
    [dragX, width],
  );

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;

    async function playWelcomeAnimation() {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (cancelled) return;

      if (reduceMotion) {
        [
          ...bars,
          wordmarkOpacity,
          taglineOpacity,
          sceneOpacity,
          sunProgress,
          welcomeActionsOpacity,
        ].forEach((value) => value.setValue(1));
        welcomeActionsY.setValue(0);
        return;
      }

      const middle = (VOICE_MARK_BARS.length - 1) / 2;
      animation = Animated.parallel([
        ...bars.map((bar, index) =>
          reveal(bar, 90 + Math.abs(index - middle) * 65, 600),
        ),
        reveal(sceneOpacity, 0, 900),
        reveal(wordmarkOpacity, 340, 720),
        reveal(taglineOpacity, 650, 680),
        reveal(sunProgress, 330, 1450),
        reveal(welcomeActionsOpacity, 620, 620),
        Animated.timing(welcomeActionsY, {
          toValue: 0,
          delay: 620,
          duration: 620,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]);
      welcomeAnimation.current = animation;
      animation.start();
    }

    void playWelcomeAnimation();
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [
    bars,
    sceneOpacity,
    sunProgress,
    taglineOpacity,
    welcomeActionsOpacity,
    welcomeActionsY,
    wordmarkOpacity,
  ]);

  useEffect(() => {
    if (showWelcome) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    slideProgress.setValue(0);

    async function animateSlideIn() {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (cancelled) return;
      if (reduceMotion) {
        slideProgress.setValue(1);
        return;
      }
      animation = Animated.timing(slideProgress, {
        toValue: 1,
        duration: 340,
        easing: EASE_OUT,
        useNativeDriver: true,
      });
      animation.start();
    }

    void animateSlideIn();
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [showWelcome, slideProgress, step]);

  async function finishOnboarding() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await completeOnboarding();
      router.replace("/(auth)/login");
    } catch {
      setError("We couldn't save your progress. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGetStarted() {
    if (isSubmitting) return;
    welcomeAnimation.current?.stop();
    setError(null);
    directionRef.current = 1;
    setShowWelcome(false);
  }

  function moveToStep(nextStep: number) {
    if (isSubmitting) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, nextStep));
    if (clamped === stepRef.current) return;
    directionRef.current = clamped > stepRef.current ? 1 : -1;
    dragX.stopAnimation();
    dragX.setValue(0);
    setError(null);
    setStep(clamped);
  }

  function handleNext() {
    if (isSubmitting) return;
    if (isLastStep) {
      void finishOnboarding();
      return;
    }
    moveToStep(step + 1);
  }

  const sunTranslateY = sunProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SUN_HIDDEN_OFFSET * (sceneSize / SCENE_CANVAS), 0],
  });
  const wordmarkTranslateY = wordmarkOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const contentDragX = dragX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [-width * 0.055, 0, width * 0.055],
    extrapolate: "clamp",
  });
  const visualDragX = dragX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [width * 0.09, 0, -width * 0.09],
    extrapolate: "clamp",
  });
  const slideTranslateY = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const slideTranslateX = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [directionRef.current * 18, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.screen}>
        {showWelcome ? (
          <View style={styles.welcomeScreen}>
            <View
              pointerEvents="none"
              style={[
                styles.welcomeScene,
                {
                  width: sceneSize,
                  height: sceneSize,
                  left: (width - sceneSize) / 2,
                  bottom: 0,
                },
              ]}
            >
              <Animated.View style={[styles.sceneLayer, { opacity: sceneOpacity }]}>
                <SkyLayer size={sceneSize} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.sceneLayer,
                  { opacity: sceneOpacity, transform: [{ translateY: sunTranslateY }] },
                ]}
              >
                <SunLayer size={sceneSize} />
              </Animated.View>
              <Animated.View style={[styles.sceneLayer, { opacity: sceneOpacity }]}>
                <LandLayer size={sceneSize} />
              </Animated.View>
            </View>

            <View style={[styles.welcomeBrand, { paddingTop: Math.max(36, height * 0.115) }]}>
              <VoiceMark scale={0.82} color={colors.primary} barValues={bars} />
              <Animated.Text
                style={[
                  styles.welcomeWordmark,
                  {
                    color: colors.textPrimary,
                    opacity: wordmarkOpacity,
                    transform: [{ translateY: wordmarkTranslateY }],
                  },
                ]}
              >
                VoiceNest
              </Animated.Text>
              <Animated.Text
                style={[styles.welcomeTagline, { color: colors.textSecondary, opacity: taglineOpacity }]}
              >
                Small voices. Big moments.
              </Animated.Text>
            </View>

            <View style={styles.welcomeFooter}>
              {error ? <Text style={styles.welcomeError}>{error}</Text> : null}
              <Animated.View
                style={[
                  styles.welcomeActions,
                  { opacity: welcomeActionsOpacity, transform: [{ translateY: welcomeActionsY }] },
                ]}
              >
                <TouchableOpacity
                  style={[styles.welcomePrimaryButton, isSubmitting && styles.disabledButton]}
                  onPress={handleGetStarted}
                  disabled={isSubmitting}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Get started with VoiceNest"
                >
                  <Text style={styles.welcomePrimaryText}>Get Started</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.accountButton}
                  onPress={() => void finishOnboarding()}
                  disabled={isSubmitting}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel="I already have an account"
                >
                  <Text style={styles.accountButtonText}>
                    {isSubmitting ? "Please wait..." : "I already have an account"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        ) : (
          <View style={styles.contentScreen}>
            <View style={styles.contentHeader}>
              <View style={styles.brandLockup}>
                <View style={styles.brandMark}>
                  <VoiceMark scale={0.31} color={colors.tealStrong} />
                </View>
                <Text style={styles.brandName}>VoiceNest</Text>
              </View>
              <TouchableOpacity
                onPress={() => void finishOnboarding()}
                disabled={isSubmitting}
                style={styles.skipButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
              >
                <Text style={styles.skipText}>Skip</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.progressTrack} accessibilityLabel={`Onboarding step ${step + 1} of ${slides.length}`}>
              {slides.map((slide, index) => (
                <View
                  key={slide.title}
                  style={[
                    styles.progressSegment,
                    index <= step && styles.progressSegmentActive,
                    index < step && styles.progressSegmentComplete,
                  ]}
                />
              ))}
            </View>

            <Animated.View style={styles.swipeArea} {...swipeResponder.panHandlers}>
              <ScrollView
                style={styles.contentScroll}
                contentContainerStyle={styles.contentScrollInner}
                showsVerticalScrollIndicator={false}
                bounces={false}
                alwaysBounceVertical={false}
                keyboardShouldPersistTaps="handled"
              >
                <Animated.View
                  style={[
                    styles.slideContent,
                    {
                      opacity: slideProgress,
                      transform: [
                        { translateY: slideTranslateY },
                        { translateX: Animated.add(contentDragX, slideTranslateX) },
                      ],
                    },
                  ]}
                >
                  <View style={styles.copyBlock}>
                    <View style={styles.eyebrowRow}>
                      <Text style={styles.eyebrow}>{currentSlide.eyebrow}</Text>
                      <Text style={styles.stepNumber}>{String(step + 1).padStart(2, "0")} / 03</Text>
                    </View>

                

                    <Text style={styles.slideTitle}>{currentSlide.title}</Text>
                    <Text style={styles.slideDescription}>{currentSlide.description}</Text>

                    <View style={styles.swipeHint}>
                      <Ionicons name="swap-horizontal-outline" size={16} color={colors.tealStrong} />
                      <Text style={styles.swipeHintText}>Swipe to explore</Text>
                    </View>
                  </View>

                  <Animated.View style={[styles.visualContainer, { transform: [{ translateX: visualDragX }] }]}>
                    <SlideVisualCard visual={currentSlide.visual} styles={styles} colors={colors} />
                  </Animated.View>
                </Animated.View>
              </ScrollView>
            </Animated.View>

            <View style={styles.contentFooter}>
              <View
                style={styles.pagination}
                accessibilityRole="progressbar"
                accessibilityLabel={`Onboarding step ${step + 1} of ${slides.length}`}
                accessibilityValue={{ min: 1, max: slides.length, now: step + 1 }}
              >
                {slides.map((slide, index) => (
                  <View key={slide.title} style={[styles.dot, index === step && styles.activeDot]} />
                ))}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.nextButton, isSubmitting && styles.disabledButton]}
                onPress={handleNext}
                disabled={isSubmitting}
                activeOpacity={0.88}
                accessibilityRole="button"
              >
                <Text style={styles.nextButtonText}>
                  {isSubmitting ? "Please wait..." : isLastStep ? "Get started" : "Next"}
                </Text>
                {!isSubmitting ? (
                  <Ionicons name={isLastStep ? "checkmark" : "arrow-forward"} size={17} color={colors.textInverse} />
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

type SlideVisualCardProps = {
  visual: SlideVisual;
  styles: ReturnType<typeof createStyles>;
  colors: Theme;
};

function SlideVisualCard({ visual, styles, colors }: SlideVisualCardProps) {
  if (visual === "intention") {
    return (
      <View style={[styles.visualPanel, styles.intentionPanel]} accessibilityRole="image" accessibilityLabel="A gentle intention note">
        <View style={styles.sunDecorLarge} />
        <View style={styles.visualTopRow}>
          <View style={styles.visualIconWarm}>
            <Ionicons name="sunny-outline" size={21} color={colors.textPrimary} />
          </View>
          <View style={styles.visualTopCopy}>
            <Text style={styles.visualEyebrow}>A NOTE TO SELF</Text>
            <Text style={styles.visualSubheading}>Today's intention</Text>
          </View>
        </View>

        <Text style={styles.intentionQuote}>“I can take today one moment at a time.”</Text>

        <View style={styles.visualDivider} />
        <View style={styles.visualBottomRow}>
          <View style={styles.smallWave}>
            {[10, 16, 8, 20, 13, 7, 16, 10, 5].map((bar, index) => (
              <View key={index} style={[styles.smallWaveBar, { height: bar }]} />
            ))}
          </View>
          <Text style={styles.visualBottomText}>A little space to begin again</Text>
        </View>
      </View>
    );
  }

  if (visual === "voice") {
    return (
      <View style={[styles.visualPanel, styles.voicePanel]} accessibilityRole="image" accessibilityLabel="A voice note recording card">
        <View style={styles.visualTopRow}>
          <View style={styles.visualIconTeal}>
            <Ionicons name="mic-outline" size={21} color={colors.tealStrong} />
          </View>
          <View style={styles.visualTopCopy}>
            <Text style={styles.visualEyebrow}>VOICE NOTE</Text>
            <Text style={styles.visualSubheading}>A message in your voice</Text>
          </View>
          <View style={styles.durationPill}>
            <View style={styles.durationDot} />
            <Text style={styles.durationText}>00:12</Text>
          </View>
        </View>

        <View style={styles.recordingCenter}>
          <View style={styles.micHalo}>
            <View style={styles.micCircle}>
              <Ionicons name="mic" size={28} color={colors.textInverse} />
            </View>
          </View>
          <Text style={styles.recordingCaption}>Every word, in your own voice.</Text>
        </View>

        <View style={styles.waveform}>
          {WAVEFORM.map((bar, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: bar,
                  opacity: 0.48 + ((index % 4) * 0.12),
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.visualPanel, styles.rhythmPanel]} accessibilityRole="image" accessibilityLabel="A scheduled encouragement reminder">
      <View style={styles.visualTopRow}>
        <View style={styles.visualIconSage}>
          <Ionicons name="calendar-clear-outline" size={21} color={colors.sageStrong} />
        </View>
        <View style={styles.visualTopCopy}>
          <Text style={styles.visualEyebrow}>YOUR DAILY MOMENT</Text>
          <Text style={styles.visualSubheading}>Make it a gentle ritual</Text>
        </View>
      </View>

      <View style={styles.reminderCard}>
        <View style={styles.reminderCalendar}>
          <Text style={styles.reminderCalendarMonth}>DAY</Text>
          <Text style={styles.reminderCalendarDay}>07</Text>
        </View>
        <View style={styles.reminderDetails}>
          <Text style={styles.reminderTitle}>Morning encouragement</Text>
          <View style={styles.reminderTimeRow}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.reminderTime}>7:00 AM · Your time</Text>
          </View>
        </View>
        <View style={styles.reminderCheck}>
          <Ionicons name="checkmark" size={16} color={colors.tealStrong} />
        </View>
      </View>

      <View style={styles.weekRow}>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <View key={`${day}-${index}`} style={[styles.weekDay, index < 5 && styles.weekDaySelected]}>
            <Text style={[styles.weekDayText, index < 5 && styles.weekDayTextSelected]}>{day}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: Theme, dimensions: { width: number; height: number; visualHeight: number; isLandscape: boolean; isCompact: boolean; isTablet: boolean }) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    screen: { flex: 1, backgroundColor: colors.background },

    // First welcome page: the landscape remains here only.
    welcomeScreen: {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      backgroundColor: colors.background,
    },
    welcomeScene: { position: "absolute", zIndex: 0 },
    sceneLayer: { ...StyleSheet.absoluteFillObject },
    welcomeBrand: {
      alignItems: "center",
      paddingHorizontal: dimensions.isCompact ? Spacing.four : Spacing.six,
      zIndex: 2,
    },
    welcomeWordmark: {
      marginTop: 11,
      fontFamily: "serif",
      fontSize: dimensions.isLandscape ? 29 : dimensions.isCompact ? 30 : 34,
      lineHeight: dimensions.isLandscape ? 36 : dimensions.isCompact ? 37 : 42,
      fontWeight: "500",
      letterSpacing: -0.5,
      textAlign: "center",
    },
    welcomeTagline: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "400",
      letterSpacing: 0.1,
      textAlign: "center",
    },
    welcomeFooter: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5,
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 5,
      paddingHorizontal: Spacing.four,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    welcomeActions: { width: "100%", maxWidth: 380, alignItems: "stretch" },
    welcomePrimaryButton: {
      minHeight: 50,
      paddingHorizontal: Spacing.four,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
    },
    welcomePrimaryText: {
      color: colors.textInverse,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "700",
      letterSpacing: 0.1,
    },
    accountButton: {
      minHeight: 42,
      marginTop: 3,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.pill,
    },
    accountButtonText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      textAlign: "center",
    },
    welcomeError: {
      maxWidth: 340,
      marginBottom: 7,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      color: colors.danger,
    },
    disabledButton: { opacity: 0.62 },

    // Editorial content slides: generous text margins, no landscape scene.
    contentScreen: { flex: 1, backgroundColor: colors.background },
    contentHeader: {
      minHeight: 54,
      paddingHorizontal: dimensions.isCompact ? 16 : dimensions.isTablet ? 28 : 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandLockup: { flexDirection: "row", alignItems: "center", gap: 9 },
    brandMark: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceTeal,
    },
    brandName: {
      fontFamily: "serif",
      fontSize: 19,
      lineHeight: 25,
      letterSpacing: -0.25,
      color: colors.textPrimary,
    },
    skipButton: {
      minHeight: 38,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundSubtle,
    },
    skipText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "600" },
    progressTrack: {
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: dimensions.isCompact ? 16 : dimensions.isTablet ? 28 : 22,
      paddingTop: 4,
      paddingBottom: 8,
    },
    progressSegment: {
      flex: 1,
      height: 3,
      borderRadius: Radius.pill,
      backgroundColor: colors.border,
    },
    progressSegmentActive: { backgroundColor: colors.primary },
    progressSegmentComplete: { backgroundColor: colors.tealStrong },
    swipeArea: { flex: 1 },
    contentScroll: { flex: 1 },
    contentScrollInner: {
      flexGrow: 1,
      paddingHorizontal: dimensions.isCompact ? 16 : dimensions.isTablet ? 28 : 22,
      paddingTop: dimensions.isLandscape ? 8 : 23,
      paddingBottom: dimensions.isLandscape ? 8 : 20,
      alignItems: "center",
    },
    slideContent: { width: "100%", maxWidth: dimensions.isTablet ? 760 : 500, alignSelf: "center", flexDirection: dimensions.isLandscape ? "row" : "column", alignItems: dimensions.isLandscape ? "center" : "stretch", gap: dimensions.isLandscape ? 22 : 0 },
    visualContainer: { width: dimensions.isLandscape ? undefined : "100%", flex: dimensions.isLandscape ? 1 : undefined, minWidth: 0, alignItems: "center" },
    copyBlock: { width: dimensions.isLandscape ? "48%" : "100%", minWidth: 0, flexShrink: 1 },
    eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
    eyebrowDot: { width: 7, height: 7, borderRadius: Radius.pill, backgroundColor: colors.accent },
    eyebrow: {
      flex: 1,
      color: colors.tealStrong,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: "800",
      letterSpacing: 1.25,
    },
    stepNumber: {
      color: colors.textTertiary,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: "700",
      letterSpacing: 0.5,
      fontVariant: ["tabular-nums"],
    },
    backLink: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      marginTop: -3,
      marginBottom: 12,
      paddingVertical: 4,
      paddingRight: 8,
    },
    backLinkText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.tealStrong },
    slideTitle: {
      width: "100%",
      maxWidth: 440,
      alignSelf: "flex-start",
      fontFamily: "serif",
      fontSize: dimensions.isLandscape ? 27 : dimensions.width < 360 ? 29 : dimensions.isTablet ? 36 : 33,
      lineHeight: dimensions.isLandscape ? 33 : dimensions.width < 360 ? 35 : dimensions.isTablet ? 43 : 40,
      letterSpacing: -0.65,
      fontWeight: "500",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    slideDescription: {
      width: "100%",
      maxWidth: 450,
      alignSelf: "flex-start",
      marginTop: dimensions.isLandscape ? 7 : 13,
      fontSize: dimensions.isCompact ? 14 : 15,
      lineHeight: dimensions.isLandscape ? 20 : 24,
      fontWeight: "400",
      letterSpacing: 0.03,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    swipeHint: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 7,
      marginTop: 13,
      paddingVertical: 5,
    },
    swipeHintText: { color: colors.textTertiary, fontSize: 11, lineHeight: 15, fontWeight: "500" },

    // Three original UI motifs replace the landscape on all content pages.
    visualPanel: {
      width: "100%",
      maxWidth: dimensions.isTablet ? 520 : 460,
      height: dimensions.visualHeight,
      alignSelf: "center",
      marginTop: dimensions.isLandscape ? 0 : dimensions.isCompact ? 14 : 24,
      padding: dimensions.isCompact ? 14 : 19,
      borderRadius: 26,
      borderWidth: 1,
      overflow: "hidden",
      justifyContent: "space-between",
    },
    intentionPanel: { backgroundColor: colors.surfaceYellow, borderColor: colors.border },
    voicePanel: { backgroundColor: colors.surfaceTeal, borderColor: colors.border },
    rhythmPanel: { backgroundColor: colors.surfaceSage, borderColor: colors.border },
    sunDecorLarge: {
      position: "absolute",
      width: 146,
      height: 146,
      borderRadius: 73,
      right: -43,
      top: -61,
      backgroundColor: colors.accent,
      opacity: 0.15,
    },
    visualTopRow: { flexDirection: "row", alignItems: "center", gap: 11 },
    visualIconWarm: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    visualIconTeal: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    visualIconSage: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    visualTopCopy: { flex: 1, minWidth: 0 },
    visualEyebrow: {
      color: colors.textTertiary,
      fontSize: 9,
      lineHeight: 13,
      fontWeight: "800",
      letterSpacing: 1.05,
    },
    visualSubheading: {
      marginTop: 3,
      color: colors.textPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "700",
      flexShrink: 1,
    },
    intentionQuote: {
      marginTop: 11,
      maxWidth: 340,
      fontFamily: "serif",
      fontSize: dimensions.width < 360 ? 22 : 25,
      lineHeight: dimensions.width < 360 ? 29 : 32,
      letterSpacing: -0.25,
      color: colors.textPrimary,
    },
    visualDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, opacity: 0.9 },
    visualBottomRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    smallWave: { height: 22, flexDirection: "row", alignItems: "center", gap: 3 },
    smallWaveBar: { width: 3, minHeight: 4, borderRadius: 3, backgroundColor: colors.tealStrong },
    visualBottomText: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, fontWeight: "500" },
    durationPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    durationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tealStrong },
    durationText: { color: colors.textSecondary, fontSize: 10, lineHeight: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
    recordingCenter: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 6 },
    micHalo: {
      width: 65,
      height: 65,
      borderRadius: 33,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tealSoft,
    },
    micCircle: {
      width: 49,
      height: 49,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tealStrong,
    },
    recordingCaption: { flex: 1, maxWidth: 220, fontFamily: "serif", fontSize: 19, lineHeight: 24, color: colors.textPrimary },
    waveform: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 3 },
    waveformBar: { flex: 1, maxWidth: 7, minWidth: 2, borderRadius: Radius.pill, backgroundColor: colors.tealStrong },
    reminderCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      marginTop: 13,
      padding: 12,
      borderRadius: 18,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    reminderCalendar: {
      width: 47,
      height: 53,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceYellow,
    },
    reminderCalendarMonth: { color: colors.textSecondary, fontSize: 8, lineHeight: 11, fontWeight: "800", letterSpacing: 0.8 },
    reminderCalendarDay: { marginTop: 1, color: colors.textPrimary, fontSize: 21, lineHeight: 25, fontWeight: "700" },
    reminderDetails: { flex: 1, minWidth: 0, gap: 5 },
    reminderTitle: { color: colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: "700", flexShrink: 1 },
    reminderTimeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    reminderTime: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, fontWeight: "500", flexShrink: 1 },
    reminderCheck: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTeal },
    weekRow: { flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 12 },
    weekDay: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
    weekDaySelected: { backgroundColor: colors.tealStrong, borderColor: colors.tealStrong },
    weekDayText: { color: colors.textSecondary, fontSize: 10, lineHeight: 13, fontWeight: "700" },
    weekDayTextSelected: { color: colors.textInverse },

    // Fixed footer. The CTA is stable while only the page body responds to swipe.
    contentFooter: {
      paddingTop: 10,
      paddingBottom: 8,
      paddingHorizontal: 22,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 13 },
    dot: { width: 6, height: 6, borderRadius: Radius.pill, backgroundColor: colors.borderStrong },
    activeDot: { width: 20, backgroundColor: colors.primary },
    nextButton: {
      width: "100%",
      minHeight: 51,
      maxWidth: 500,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: Spacing.four,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
    },
    nextButtonText: { color: colors.textInverse, fontSize: 14, lineHeight: 19, fontWeight: "700", letterSpacing: 0.1 },
    errorText: { marginBottom: 8, fontSize: 12, lineHeight: 17, color: colors.danger, textAlign: "center" },
  });
}
