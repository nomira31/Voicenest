import "@/global.css";

import {
  Platform,
  useColorScheme,
  type ColorSchemeName,
} from "react-native";

export const Palette = {
  // Warmer, creamier ivory (sunlit paper)
  ivory: "#FBF6E9",
  ivoryBright: "#FFFCF4",
  ivoryMuted: "#F3ECDA",
  ivorySoft: "#F8F2E2",

  navy: "#15365E",
  navySoft: "#1F4770",
  navyDeep: "#0E2A4A",

  // Livelier teal
  teal: "#34898A",
  tealDeep: "#256F72",
  tealLight: "#DDF0EE",

  sage: "#9CC3A5",
  sageDeep: "#6FA07C",
  sageLight: "#DCEBDD",

  // Real sky blue, like the AI Voice tile in the mockup
  sky: "#A9CBE8",
  skyLight: "#DDEBF8",

  // Sunrise yellow, glowier and more saturated
  yellow: "#F7C948",
  yellowDeep: "#EDB02A",
  yellowLight: "#FFEFC2",

  // Warm accents
  peach: "#FFDFC8",
  coral: "#EE8A6B",

  white: "#FFFCF4",
  black: "#0A1A2E",
} as const;

const Light = {
  text: Palette.navy,
  background: Palette.ivory,
  backgroundElement: Palette.ivoryMuted,
  backgroundSelected: "#E4ECF3",
  textSecondary: "#5B6B85",

  backgroundElevated: Palette.ivoryBright,
  backgroundSubtle: Palette.ivorySoft,
  surfaceYellow: Palette.yellowLight,
  surfaceTeal: Palette.tealLight,
  surfaceSage: Palette.sageLight,
  surfaceSky: Palette.skyLight,
  surfacePeach: Palette.peach,

  primary: Palette.navy,
  primaryHover: Palette.navySoft,
  primaryPressed: Palette.navyDeep,
  accent: Palette.yellow,
  accentStrong: Palette.yellowDeep,
  accentSoft: Palette.yellowLight,
  accentWarm: Palette.coral,
  teal: Palette.teal,
  tealStrong: Palette.tealDeep,
  tealSoft: Palette.tealLight,
  sage: Palette.sage,
  sageStrong: Palette.sageDeep,
  sageSoft: Palette.sageLight,
  sky: Palette.sky,
  skySoft: Palette.skyLight,

  textPrimary: Palette.navy,
  textTertiary: "#8A96AB",
  textInverse: Palette.ivoryBright,
  textOnAccent: Palette.navy,

  border: "#EBE3CF",
  borderStrong: "#DDD3BA",
  divider: "#F0E9D6",
  overlay: "rgba(21, 54, 94, 0.08)",
  scrim: "rgba(8, 24, 46, 0.52)",

  success: "#4E9A78",
  successSoft: "#DFF1E6",
  warning: "#E0A12F",
  warningSoft: "#FFF0CC",
  danger: "#D9695F",
  dangerSoft: "#FADFDB",
  info: "#4F82B3",
  infoSoft: "#DDEBF8",
} as const;

// Dark mode = twilight: deep blue-indigo with a warm glow, not cold black
const Dark = {
  ...Light,

  text: "#FBF3E0",
  background: "#0F1A33",
  backgroundSubtle: "#131F3C",
  backgroundElevated: "#1A2849",
  backgroundElement: "#223158",
  backgroundSelected: "#2B3D6B",

  textPrimary: "#FBF3E0",
  textSecondary: "#B4C0DB",
  textTertiary: "#7F8DB0",
  textInverse: "#0F1A33",
  textOnAccent: "#15244A",

  surfaceYellow: "#3A3220",
  surfaceTeal: "#173A47",
  surfaceSage: "#1F3A3E",
  surfaceSky: "#1D3560",
  surfacePeach: "#3F2D33",

  // Warm yellow buttons glow against the blue
  primary: "#FFD36B",
  primaryHover: "#FFDF8F",
  primaryPressed: "#F2BE45",

  accent: Palette.yellow,
  accentStrong: "#FFD566",
  accentSoft: "#3A3220",
  accentWarm: "#FF9D80",
  teal: "#5FC0BA",
  tealStrong: "#86D8D1",
  tealSoft: "#173A47",
  sage: "#A5CDAE",
  sageStrong: "#8CBF9A",
  sageSoft: "#1F3A3E",
  sky: "#86B4E2",
  skySoft: "#1D3560",

  border: "#2C3C66",
  borderStrong: "#3C5084",
  divider: "#22325A",
  overlay: "rgba(255, 255, 255, 0.07)",
  scrim: "rgba(4, 8, 20, 0.74)",

  success: "#76CBA2",
  successSoft: "#17382F",
  warning: "#F0BE60",
  warningSoft: "#41361C",
  danger: "#F2988F",
  dangerSoft: "#43232A",
  info: "#86B4E2",
  infoSoft: "#1D3560",
} as const;

export const Colors = {
  light: Light,
  dark: Dark,
} as const;

export type ThemeColor =
  keyof typeof Colors.light & keyof typeof Colors.dark;

export type Theme = typeof Colors.light;
export type ThemeName = keyof typeof Colors;

export const getThemeName = (
  colorScheme: ColorSchemeName,
): ThemeName => (colorScheme === "dark" ? "dark" : "light");

export const getTheme = (colorScheme: ColorSchemeName): Theme =>
  Colors[getThemeName(colorScheme)] as Theme;

export function useAppTheme(): Theme {
  const scheme = useColorScheme();
  return Colors[scheme === "dark" ? "dark" : "light"] as Theme;
}

export const Typography = {
  displayXL: {
    fontFamily: "serif",
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  display: {
    fontFamily: "serif",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headline: {
    fontFamily: "sans",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  title: {
    fontFamily: "sans",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  body: {
    fontFamily: "sans",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyMedium: {
    fontFamily: "sans",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  label: {
    fontFamily: "sans",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: "sans",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: 0.15,
  },
  mono: {
    fontFamily: "mono",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 32,
  eight: 40,
  nine: 48,
  ten: 64,
} as const;

export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

const lightCardShadow = {
  shadowColor: "#2A3F63",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
} as const;

const lightFloatingShadow = {
  shadowColor: "#2A3F63",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 6,
} as const;

const darkCardShadow = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.22,
  shadowRadius: 18,
  elevation: 3,
} as const;

const darkFloatingShadow = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.3,
  shadowRadius: 28,
  elevation: 7,
} as const;

export const Shadows = {
  light: {
    card: lightCardShadow,
    floating: lightFloatingShadow,
  },
  dark: {
    card: darkCardShadow,
    floating: darkFloatingShadow,
  },
} as const;

export const Layout = {
  screenHorizontal: 20,
  screenHorizontalCompact: 16,
  contentMaxWidth: 800,
  controlHeight: 48,
  controlHeightLarge: 54,
  iconButton: 44,
  minTouchTarget: 44,
  bottomBarHeight: 72,
} as const;

export const BottomTabInset = Platform.select({
  ios: 50,
  android: 80,
}) ?? 0;

export const MaxContentWidth = Layout.contentMaxWidth;