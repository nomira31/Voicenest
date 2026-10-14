// lib/alarms/alarm-settings.ts
//
// Per-alarm ring behaviour: snooze, volume, and whether the recording repeats.
//
// Persisted as columns on the `alarms` table (see database.ts).
//
// How each setting reaches the OS (react-native-alarm-scheduler 1.0.1):
//   Snooze            Android: the ring screen's Stop button becomes "Snooze" and re-arms the
//                     alarm after N minutes (stopIntentBehavior "rescheduleImmediate" +
//                     backupDelaySeconds). "Dismiss" opens the app, which ends the alarm.
//   Volume            Android: fraction of the alarm stream volume, pinned while ringing.
//   Gradual volume    Android: native ring service ramps the alarm stream from startingVolume to volume.
//   Repeat recording  Android: the ring service always loops the audio, so "play once" is done
//                     by ending the ring right after the recording finishes.
// iOS (AlarmKit) exposes none of these, so the UI hides them there.

import { Platform } from "react-native";

export type AlarmSettings = {
  /** 0 = snooze off. */
  snoozeMinutes: number;
  /** Fraction of max alarm volume, 0.1 to 1. */
  volume: number;
  /** true = loop until you respond, false = play once. */
  repeatRecording: boolean;
  /** Start quietly and raise the alarm volume over time on Android. */
  gradualVolume: boolean;
  /** Starting alarm-stream volume as a fraction of the device maximum. */
  startingVolume: number;
  /** Seconds taken to reach the selected target volume. */
  volumeRampDurationSeconds: number;
  /** Needed to work out how long "play once" should ring. */
  recordingDurationMillis?: number;
};

export const SETTINGS_SUPPORTED = Platform.OS === "android";

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  snoozeMinutes: 10,
  volume: 1,
  repeatRecording: true,
  gradualVolume: true,
  startingVolume: 0.1,
  volumeRampDurationSeconds: 30,
};

export const SNOOZE_OPTIONS = [0, 5, 10, 15] as const;

export const VOLUME_LEVELS = [
  { label: "Low", value: 0.35, icon: "volume-low-outline" },
  { label: "Medium", value: 0.6, icon: "volume-medium-outline" },
  { label: "High", value: 0.85, icon: "volume-high-outline" },
  { label: "Max", value: 1, icon: "volume-high" },
] as const;

const MAX_RING_SECONDS = 300;

export function normalizeSettings(value?: Partial<AlarmSettings> | null): AlarmSettings {
  const snooze = Number(value?.snoozeMinutes);
  const volume = Number(value?.volume);
  const duration = Number(value?.recordingDurationMillis);
  const startingVolume = Number(value?.startingVolume);
  const rampDuration = Number(value?.volumeRampDurationSeconds);
  return {
    snoozeMinutes: Number.isFinite(snooze) && snooze >= 0 && snooze <= 60
      ? Math.round(snooze)
      : DEFAULT_ALARM_SETTINGS.snoozeMinutes,
    volume: Number.isFinite(volume) && volume > 0
      ? Math.min(1, Math.max(0.1, volume))
      : DEFAULT_ALARM_SETTINGS.volume,
    repeatRecording: typeof value?.repeatRecording === "boolean"
      ? value.repeatRecording
      : DEFAULT_ALARM_SETTINGS.repeatRecording,
    gradualVolume: typeof value?.gradualVolume === "boolean"
      ? value.gradualVolume
      : DEFAULT_ALARM_SETTINGS.gradualVolume,
    startingVolume: Number.isFinite(startingVolume) && startingVolume > 0
      ? Math.min(1, Math.max(0.05, startingVolume))
      : DEFAULT_ALARM_SETTINGS.startingVolume,
    volumeRampDurationSeconds: Number.isFinite(rampDuration) && rampDuration >= 5 && rampDuration <= 180
      ? Math.round(rampDuration)
      : DEFAULT_ALARM_SETTINGS.volumeRampDurationSeconds,
    recordingDurationMillis: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

export function nearestVolumeLevel(volume: number) {
  return VOLUME_LEVELS.reduce((best, level) =>
    Math.abs(level.value - volume) < Math.abs(best.value - volume) ? level : best,
  );
}

/** "Snooze 10 min, High volume, Plays once" */
export function describeSettings(settings: AlarmSettings): string {
  const parts = [
    settings.snoozeMinutes > 0 ? `Snooze ${settings.snoozeMinutes} min` : "No snooze",
    settings.gradualVolume
      ? `Gradual volume (${settings.volumeRampDurationSeconds}s)`
      : `${nearestVolumeLevel(settings.volume).label} volume`,
    settings.repeatRecording ? "Repeats" : "Plays once",
  ];
  return parts.join(", ");
}

/* ───────────── native options ───────────── */

/** Spread into the `android` block of scheduleAlarmAsync. */
export function androidRingOptions(settings: AlarmSettings) {
  const snooze = settings.snoozeMinutes > 0;

  // "Play once": the ring service loops forever, so end the ring just after one play.
  const playOnceSeconds = settings.recordingDurationMillis
    ? Math.ceil(settings.recordingDurationMillis / 1000) + 3
    : 30;
  const maxRingDurationSeconds = settings.repeatRecording
    ? MAX_RING_SECONDS
    : Math.min(MAX_RING_SECONDS, Math.max(10, playOnceSeconds));

  return {
    volume: settings.volume,
    gradualVolume: settings.gradualVolume,
    startingVolume: settings.startingVolume,
    volumeRampDurationSeconds: settings.volumeRampDurationSeconds,
    enforceVolume: true,
    restoreVolume: true,
    maxRingDurationSeconds,
    // The big button on the ring screen is the "secondary" one; it opens the app, and the app
    // then ends the alarm (see alarm-handoff.ts). The outlined button is the stop action.
    secondaryButtonTitle: snooze ? "Dismiss" : "Open app",
    secondaryButtonBehavior: "openApp" as const,
    stopButtonTitle: snooze ? "Snooze" : "Stop",
    stopIntentBehavior: snooze ? ("rescheduleImmediate" as const) : ("recordOnly" as const),
    ...(snooze ? { backupDelaySeconds: settings.snoozeMinutes * 60 } : {}),
  };
}