import {
  LandLayer,
  SCENE_CANVAS,
  SUN_HIDDEN_OFFSET,
  SkyLayer,
  SunLayer,
} from "@/components/illustrations/LandScapeScene";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import {
  VOICE_MARK_BARS,
  VoiceMark,
} from "@/components/illustrations/VoiceMark";
import { Fonts, Spacing, useAppTheme } from "@/constants/theme";

type LaunchSplashProps = {
  /** Time the splash stays on screen before fading out (ms). */
  duration?: number;
  /** Called once the splash has fully faded out. */
  onFinish?: () => void;
};

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

function reveal(value: Animated.Value, delay: number, duration: number) {
  return Animated.timing(value, {
    toValue: 1,
    delay,
    duration,
    easing: EASE_OUT,
    useNativeDriver: true,
  });
}

export function LaunchSplash({
  duration = 2600,
  onFinish,
}: LaunchSplashProps) {
  const colors = useAppTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // On Android, "window" excludes the status bar / nav bar area, while
  // "screen" is the full physical display. Use the larger of the two so the
  // splash always covers everything.
  const screen = Dimensions.get("screen");
  const width =
    Platform.OS === "android" ? Math.max(windowWidth, screen.width) : windowWidth;
  const height =
    Platform.OS === "android"
      ? Math.max(windowHeight, screen.height)
      : windowHeight;

  const size = width; // the landscape is a square anchored to the bottom
  const unit = size / SCENE_CANVAS;

  const bars = useMemo(
    () => VOICE_MARK_BARS.map(() => new Animated.Value(0)),
    [],
  );
  const word = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(0)).current;
  const sun = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  const didHideNativeSplash = useRef(false);
  const [visible, setVisible] = useState(true);

  const handleLayout = useCallback(() => {
    if (didHideNativeSplash.current) return;
    didHideNativeSplash.current = true;

    void SplashScreen.hideAsync().catch(() => {
      // The native splash may already have been hidden.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let intro: Animated.CompositeAnimation | undefined;
    let fadeOut: Animated.CompositeAnimation | undefined;

    const run = async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(
        () => false,
      );
      if (cancelled) return;

      if (reduceMotion) {
        [...bars, word, tag, land, sun].forEach((v) => v.setValue(1));
      } else {
        const mid = (VOICE_MARK_BARS.length - 1) / 2;
        intro = Animated.parallel([
          ...bars.map((bar, i) =>
            reveal(bar, 100 + Math.abs(i - mid) * 70, 650),
          ),
          reveal(word, 450, 800),
          reveal(tag, 800, 800),
          reveal(land, 0, 900),
          reveal(sun, 500, 1700),
        ]);
        intro.start();
      }

      exitTimer = setTimeout(() => {
        fadeOut = Animated.timing(exit, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
        fadeOut.start(({ finished }) => {
          if (finished && !cancelled) {
            setVisible(false);
            onFinish?.();
          }
        });
      }, duration);
    };

    void run();

    return () => {
      cancelled = true;
      if (exitTimer) clearTimeout(exitTimer);
      intro?.stop();
      fadeOut?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const wordShift = word.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const sunRise = sun.interpolate({
    inputRange: [0, 1],
    outputRange: [SUN_HIDDEN_OFFSET * unit, 0],
  });

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents="auto"
      accessibilityLabel="VoiceNest"
      style={[
        styles.container,
        { width, height, backgroundColor: colors.background, opacity: exit },
      ]}
    >
      <View
        style={[styles.scene, { width: size, height: size }]}
        pointerEvents="none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: land }]}>
          <SkyLayer size={size} />
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: land, transform: [{ translateY: sunRise }] },
          ]}
        >
          <SunLayer size={size} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: land }]}>
          <LandLayer size={size} />
        </Animated.View>
      </View>

      <View style={[styles.brand, { paddingTop: height * 0.16 }]}>
        <VoiceMark barValues={bars} />

        <Animated.Text
          style={[
            styles.wordmark,
            {
              color: colors.textPrimary,
              opacity: word,
              transform: [{ translateY: wordShift }],
            },
          ]}
        >
          VoiceNest
        </Animated.Text>

        <Animated.Text
          style={[styles.tagline, { color: colors.textSecondary, opacity: tag }]}
        >
          Small voices. Big moments.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 999,
    overflow: "hidden",
  },

  scene: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },

  brand: {
    alignItems: "center",
    paddingHorizontal: Spacing.six,
  },

  wordmark: {
    marginTop: Spacing.five,
    fontFamily: Fonts?.serif,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: "500",
    letterSpacing: -0.6,
  },

  tagline: {
    marginTop: Spacing.two,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: 0.1,
    textAlign: "center",
  },
});