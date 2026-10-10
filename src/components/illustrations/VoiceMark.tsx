import { Animated, View } from "react-native";

import { useAppTheme } from "@/constants/theme";

/** Outer bars are short, the centre is tall. */
export const VOICE_MARK_BARS = [10, 22, 36, 46, 36, 22, 10] as const;

type VoiceMarkProps = {
  /** Scales the whole mark. 1 = 46px tall. */
  scale?: number;
  /** Defaults to the theme's primary colour. */
  color?: string;
  /**
   * Optional animated values (one per bar, 0 → 1) driving each bar's height.
   * Leave out for a static mark.
   */
  barValues?: Animated.Value[];
};

export function VoiceMark({ scale = 1, color, barValues }: VoiceMarkProps) {
  const theme = useAppTheme();
  const fill = color ?? theme.primary;
  const width = 4 * scale;
  const gap = 6 * scale;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="VoiceNest"
      style={{
        height: 46 * scale,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap,
      }}
    >
      {VOICE_MARK_BARS.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            width,
            height: h * scale,
            borderRadius: width / 2,
            backgroundColor: fill,
            transform: [{ scaleY: barValues?.[i] ?? 1 }],
          }}
        />
      ))}
    </View>
  );
}