import { StyleSheet, View, useColorScheme } from "react-native";
import Svg, {
    Circle,
    Defs,
    Ellipse,
    LinearGradient,
    Path,
    RadialGradient,
    Rect,
    Stop,
} from "react-native-svg";

import { useAppTheme } from "@/constants/theme";

/** The artwork is drawn on a 400 x 400 canvas and scaled to `size`. */
export const SCENE_CANVAS = 400;

/** How far (in canvas units) the sun sits below its resting position when hidden. */
export const SUN_HIDDEN_OFFSET = 90;

const SCENE = {
  light: {
    skyMid: "#D5E6E4",
    skyLow: "#F6E6AE",
    glow: "#FBE39A",
    sun: "#F6D56E",
    farRidge: "#BBD3DA",
    nearRidge: "#9ABBC6",
    lakeTop: "#F3DF9F",
    lakeBottom: "#B9D6D6",
    reflection: "#F6D56E",
    hillLight: "#A9C1AE",
    hillDeep: "#85A58E",
  },
  dark: {
    skyMid: "#173540",
    skyLow: "#3A3A24",
    glow: "#F4C84D",
    sun: "#F4C84D",
    farRidge: "#24464F",
    nearRidge: "#1C3A44",
    lakeTop: "#3C4A33",
    lakeBottom: "#173B3E",
    reflection: "#F4C84D",
    hillLight: "#2C4A3E",
    hillDeep: "#203A31",
  },
} as const;

export function useSceneColors() {
  return SCENE[useColorScheme() === "dark" ? "dark" : "light"];
}

type LayerProps = {
  /** Rendered width and height in px. */
  size: number;
};

/** Sky wash that fades from transparent (top) to warm yellow (bottom). */
export function SkyLayer({ size }: LayerProps) {
  const theme = useAppTheme();
  const scene = useSceneColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 400 400">
      <Defs>
        <LinearGradient id="vn-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.background} stopOpacity={0} />
          <Stop offset="0.45" stopColor={scene.skyMid} stopOpacity={0.6} />
          <Stop offset="1" stopColor={scene.skyLow} stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="400" fill="url(#vn-sky)" />
    </Svg>
  );
}

/** Sun and its glow. Kept separate so it can be animated behind the ridge. */
export function SunLayer({ size }: LayerProps) {
  const scene = useSceneColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 400 400">
      <Defs>
        <RadialGradient
          id="vn-glow"
          cx="205"
          cy="205"
          r="170"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={scene.glow} stopOpacity={0.85} />
          <Stop offset="1" stopColor={scene.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="205" cy="205" r="170" fill="url(#vn-glow)" />
      <Circle cx="205" cy="205" r="36" fill={scene.sun} />
    </Svg>
  );
}

/** Ridges, lake, reflection and foreground hills. */
export function LandLayer({ size }: LayerProps) {
  const scene = useSceneColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 400 400">
      <Defs>
        <LinearGradient id="vn-lake" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={scene.lakeTop} />
          <Stop offset="1" stopColor={scene.lakeBottom} />
        </LinearGradient>
      </Defs>

      <Path
        d="M0 258 L50 218 L90 186 L150 228 L205 240 L265 205 L320 176 L370 214 L400 236 L400 400 L0 400 Z"
        fill={scene.farRidge}
        stroke={scene.farRidge}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <Path
        d="M0 302 L70 256 L135 292 L200 268 L275 302 L340 262 L400 294 L400 400 L0 400 Z"
        fill={scene.nearRidge}
        stroke={scene.nearRidge}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <Rect x="0" y="300" width="400" height="100" fill="url(#vn-lake)" />
      <Ellipse cx="205" cy="322" rx="38" ry="5" fill={scene.reflection} opacity={0.6} />
      <Ellipse cx="205" cy="338" rx="22" ry="3.5" fill={scene.reflection} opacity={0.4} />

      <Path d="M0 345 Q60 318 118 358 Q150 380 140 400 L0 400 Z" fill={scene.hillLight} />
      <Path d="M0 374 Q48 352 100 386 L110 400 L0 400 Z" fill={scene.hillDeep} />
      <Path d="M400 336 Q342 314 292 354 Q262 380 280 400 L400 400 Z" fill={scene.hillLight} />
      <Path d="M400 366 Q352 346 312 380 L302 400 L400 400 Z" fill={scene.hillDeep} />
    </Svg>
  );
}

/**
 * The full static scene (sky + sun + land) for use anywhere in the app:
 * onboarding, empty states, sign-in, profile headers.
 *
 *   <LandscapeScene size={width} />
 */
export function LandscapeScene({ size }: LayerProps) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={StyleSheet.absoluteFill}>
        <SkyLayer size={size} />
      </View>
      <View style={StyleSheet.absoluteFill}>
        <SunLayer size={size} />
      </View>
      <View style={StyleSheet.absoluteFill}>
        <LandLayer size={size} />
      </View>
    </View>
  );
}