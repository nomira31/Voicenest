import {
  deleteAlarmRow,
  fetchAllAlarmRows,
  upsertAlarmRow,
  type AlarmRow,
} from "@/lib/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { PermissionsAndroid, Platform } from "react-native";
import ExpoAlarm from "react-native-alarm-scheduler";
import { logAlarmEvent } from "./alarm-log";
import {
  androidRingOptions,
  normalizeSettings,
  type AlarmSettings,
} from "./alarm-settings";
import {
  ensureIosNotificationSound,
  prepareAlarmSound,
  releaseAlarmSound,
} from "./alarm-sound";

export type AlarmWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AlarmDelivery = "native" | "native-no-full-screen" | "notification";

export type AppAlarm = {
  id: string;
  title: string;
  hour: number;
  minute: number;
  weekdays: AlarmWeekday[];
  enabled: boolean;
  delivery: AlarmDelivery;
  notificationIds: string[];
  nextFireAt: number | null;
  createdAt: number;
  recordingId?: string;
  recordingUri?: string;
  recordingTitle?: string;
  soundUri?: string;
  settings: AlarmSettings;
};

export type CreateAlarmInput = {
  title: string;
  hour: number;
  minute: number;
  weekdays: AlarmWeekday[];
  recordingId?: string;
  recordingUri?: string;
  recordingTitle?: string;
  recordingDurationMillis?: number;
  settings?: Partial<AlarmSettings>;
};

const LEGACY_STORAGE_KEY = "voice-note.alarms.v1";
const CHANNEL_ID = "voice-note-alarms";
const NATIVE_CALL_TIMEOUT_MS = 3000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function createUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeAlarm(value: Partial<AppAlarm>): AppAlarm | null {
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.hour !== "number" ||
    typeof value.minute !== "number"
  ) {
    return null;
  }

  const validWeekdays = (value.weekdays ?? []).filter(
    (day): day is AlarmWeekday => Number.isInteger(day) && day >= 1 && day <= 7,
  );

  return {
    id: value.id,
    title: value.title,
    hour: value.hour,
    minute: value.minute,
    weekdays: [...new Set(validWeekdays)].sort((a, b) => a - b),
    enabled: value.enabled ?? false,
    delivery: value.delivery ?? "notification",
    notificationIds: value.notificationIds ?? [],
    nextFireAt: value.nextFireAt ?? null,
    createdAt: value.createdAt ?? Date.now(),
    recordingId: typeof value.recordingId === "string" ? value.recordingId : undefined,
    recordingUri: typeof value.recordingUri === "string" ? value.recordingUri : undefined,
    recordingTitle: typeof value.recordingTitle === "string" ? value.recordingTitle : undefined,
    soundUri: typeof value.soundUri === "string" ? value.soundUri : undefined,
    settings: normalizeSettings(value.settings),
  };
}

function rowToAlarm(row: AlarmRow): AppAlarm | null {
  return normalizeAlarm({
    id: row.id,
    title: row.title,
    hour: row.hour,
    minute: row.minute,
    weekdays: parseJsonArray<AlarmWeekday>(row.weekdays),
    enabled: row.enabled === 1,
    delivery: row.delivery as AlarmDelivery,
    notificationIds: parseJsonArray<string>(row.notificationIds),
    nextFireAt: row.nextFireAt,
    createdAt: row.createdAt,
    recordingId: row.recordingId ?? undefined,
    recordingUri: row.recordingUri ?? undefined,
    recordingTitle: row.recordingTitle ?? undefined,
    soundUri: row.soundUri ?? undefined,
    settings: {
      snoozeMinutes: row.snoozeMinutes,
      volume: row.volume,
      repeatRecording: row.repeatRecording === 1,
      recordingDurationMillis: row.recordingDurationMillis ?? undefined,
      gradualVolume: row.gradualVolume === 1,
      startingVolume: row.startingVolume,
      volumeRampDurationSeconds: row.volumeRampDurationSeconds,
    },
  });
}

function alarmToRow(alarm: AppAlarm): AlarmRow {
  const settings = normalizeSettings(alarm.settings);
  return {
    id: alarm.id,
    title: alarm.title,
    hour: alarm.hour,
    minute: alarm.minute,
    weekdays: JSON.stringify(alarm.weekdays),
    enabled: alarm.enabled ? 1 : 0,
    delivery: alarm.delivery,
    notificationIds: JSON.stringify(alarm.notificationIds),
    nextFireAt: alarm.nextFireAt,
    createdAt: alarm.createdAt,
    recordingId: alarm.recordingId ?? null,
    recordingUri: alarm.recordingUri ?? null,
    recordingTitle: alarm.recordingTitle ?? null,
    soundUri: alarm.soundUri ?? null,
    snoozeMinutes: settings.snoozeMinutes,
    volume: settings.volume,
    repeatRecording: settings.repeatRecording ? 1 : 0,
    recordingDurationMillis: settings.recordingDurationMillis ?? null,
    gradualVolume: settings.gradualVolume ? 1 : 0,
    startingVolume: settings.startingVolume,
    volumeRampDurationSeconds: settings.volumeRampDurationSeconds,
  };
}

async function saveAlarm(alarm: AppAlarm) {
  await upsertAlarmRow(alarmToRow(alarm));
}

let migrationPromise: Promise<void> | null = null;

function migrateLegacyAlarms(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        const stored = await withTimeout(
          AsyncStorage.getItem(LEGACY_STORAGE_KEY),
          2000,
          "Legacy alarm read",
        );
        if (!stored) return;

        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const alarm = normalizeAlarm(item as Partial<AppAlarm>);
            if (alarm) await saveAlarm(alarm);
          }
        }
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        console.warn("Legacy alarm migration skipped:", error);
      }
    })();
  }
  return migrationPromise;
}

async function readStoredAlarms(): Promise<AppAlarm[]> {
  await migrateLegacyAlarms();
  const rows = await fetchAllAlarmRows();
  return rows
    .map(rowToAlarm)
    .filter((item): item is AppAlarm => item !== null)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

export async function getAlarmById(id: string): Promise<AppAlarm | null> {
  const alarms = await readStoredAlarms();
  return alarms.find((alarm) => alarm.id === id) ?? null;
}

export async function getStoredAlarms(): Promise<AppAlarm[]> {
  return readStoredAlarms();
}

async function fetchNativeAlarmIds(): Promise<Set<string> | null> {
  try {
    const list = await withTimeout(
      ExpoAlarm.getScheduledAlarmsAsync(),
      NATIVE_CALL_TIMEOUT_MS,
      "ExpoAlarm.getScheduledAlarmsAsync",
    );
    return new Set(list.map((alarm) => alarm.id));
  } catch (error) {
    console.warn("Native alarm list failed:", error);
    return null;
  }
}

async function fetchNotificationIds(): Promise<Set<string> | null> {
  try {
    const list = await withTimeout(
      Notifications.getAllScheduledNotificationsAsync(),
      NATIVE_CALL_TIMEOUT_MS,
      "Notifications.getAllScheduledNotificationsAsync",
    );
    return new Set(list.map((request) => request.identifier));
  } catch (error) {
    console.warn("Notification list failed:", error);
    return null;
  }
}

export async function getAlarms(): Promise<AppAlarm[]> {
  const alarms = await readStoredAlarms();
  const now = Date.now();

  const isDue = (alarm: AppAlarm) =>
    alarm.enabled &&
    alarm.weekdays.length === 0 &&
    alarm.nextFireAt !== null &&
    alarm.nextFireAt <= now;

  const due = alarms.filter(isDue);
  if (due.length === 0) return alarms;

  const [nativeIds, notificationIds] = await Promise.all([
    due.some((alarm) => alarm.delivery !== "notification") ? fetchNativeAlarmIds() : Promise.resolve(null),
    due.some((alarm) => alarm.delivery === "notification") ? fetchNotificationIds() : Promise.resolve(null),
  ]);

  const result: AppAlarm[] = [];
  for (const alarm of alarms) {
    if (!isDue(alarm)) {
      result.push(alarm);
      continue;
    }

    const stillScheduled = alarm.delivery === "notification"
      ? notificationIds
        ? alarm.notificationIds.some((id) => notificationIds.has(id))
        : null
      : nativeIds
        ? nativeIds.has(alarm.id)
        : null;

    if (stillScheduled === false) {
      const disabled: AppAlarm = { ...alarm, enabled: false, notificationIds: [] };
      await saveAlarm(disabled);
      result.push(disabled);
    } else {
      result.push(alarm);
    }
  }
  return result;
}

export async function restoreAlarms(): Promise<void> {
  try {
    const alarms = await readStoredAlarms();
    const now = Date.now();
    const candidates = alarms.filter(
      (alarm) =>
        alarm.enabled &&
        !(alarm.weekdays.length === 0 && alarm.nextFireAt !== null && alarm.nextFireAt <= now),
    );
    if (candidates.length === 0) return;

    const [nativeIds, notificationIds] = await Promise.all([
      candidates.some((alarm) => alarm.delivery !== "notification") ? fetchNativeAlarmIds() : Promise.resolve(null),
      candidates.some((alarm) => alarm.delivery === "notification") ? fetchNotificationIds() : Promise.resolve(null),
    ]);

    for (const alarm of candidates) {
      const present = alarm.delivery === "notification"
        ? notificationIds
          ? alarm.notificationIds.some((id) => notificationIds.has(id))
          : null
        : nativeIds
          ? nativeIds.has(alarm.id)
          : null;

      if (present !== false) continue;

      try {
        const restored: AppAlarm = {
          ...alarm,
          notificationIds: [],
          nextFireAt: alarm.weekdays.length === 0
            ? getNextOneTimeDate(alarm.hour, alarm.minute).getTime()
            : null,
        };
        restored.delivery = await scheduleAlarmNative(restored, false);
        await saveAlarm(restored);
      } catch (error) {
        console.warn("Could not restore alarm", alarm.id, error);
      }
    }
  } catch (error) {
    console.warn("Alarm restore skipped:", error);
  }
}

export async function markAlarmFired(alarmId: string): Promise<void> {
  try {
    const alarm = await getAlarmById(alarmId);
    if (!alarm || !alarm.enabled || alarm.weekdays.length > 0) return;
    await saveAlarm({ ...alarm, enabled: false, notificationIds: [] });
  } catch (error) {
    console.warn("Could not mark alarm as fired:", error);
  }
}

export async function isNativeAlarmRinging(alarmId: string): Promise<boolean | null> {
  try {
    const state = await withTimeout(
      ExpoAlarm.getNativeAlarmDebugStateAsync(alarmId),
      NATIVE_CALL_TIMEOUT_MS,
      "getNativeAlarmDebugStateAsync",
    );
    return state.isRinging === true;
  } catch {
    return null;
  }
}

export async function debugAlarm(alarmId: string) {
  if (!__DEV__) return null;
  try {
    const state = await withTimeout(
      ExpoAlarm.getNativeAlarmDebugStateAsync(alarmId),
      NATIVE_CALL_TIMEOUT_MS,
      "getNativeAlarmDebugStateAsync",
    );
    console.log("ALARM DEBUG", JSON.stringify(state, null, 2));
    return state;
  } catch (error) {
    console.warn("ALARM DEBUG failed:", error);
    return null;
  }
}

export async function ensureAndroidNotificationPermission(prompt = true): Promise<boolean> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return true;
    if (!prompt) return false;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn("Notification permission request failed:", error);
    return false;
  }
}

export async function getAlarmPermissions() {
  try {
    return await withTimeout(
      ExpoAlarm.getPermissionsAsync(),
      NATIVE_CALL_TIMEOUT_MS,
      "Alarm permissions",
    );
  } catch (error) {
    console.warn("Native alarm permissions are unavailable:", error);
    return null;
  }
}

export async function requestAlarmPermissions() {
  await ensureAndroidNotificationPermission();
  const permissions = await ExpoAlarm.requestPermissionsAsync();

  if (Platform.OS === "android" && permissions.canUseFullScreenIntent === false) {
    await ExpoAlarm.openFullScreenIntentSettingsAsync().catch(() => false);
  }

  return permissions;
}

function getNextOneTimeDate(hour: number, minute: number) {
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target;
}

function isoWeekdayToNotificationWeekday(weekday: AlarmWeekday) {
  return weekday === 7 ? 1 : weekday + 1;
}

async function ensureNotificationPermission() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Alarms",
      description: "Scheduled alarms and reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#5C8A71",
      sound: "default",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Notification permission is required for alarms on this device.");
  }
}

async function scheduleNotificationFallback(alarm: AppAlarm): Promise<string[]> {
  await ensureNotificationPermission();

  const customSound = alarm.soundUri && alarm.recordingId
    ? await ensureIosNotificationSound(alarm.soundUri, alarm.recordingId)
    : null;

  const ids: string[] = [];
  const commonContent = {
    title: alarm.title || "Alarm",
    body: alarm.recordingId ? "Tap to play your recording." : "It's time.",
    sound: customSound ?? ("default" as const),
    data: {
      alarmId: alarm.id,
      source: "voice-note-alarm",
      recordingId: alarm.recordingId ?? null,
      recordingUri: alarm.recordingUri ?? null,
    },
  };

  if (alarm.weekdays.length === 0) {
    const date = getNextOneTimeDate(alarm.hour, alarm.minute);
    const id = await Notifications.scheduleNotificationAsync({
      content: commonContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
    });
    ids.push(id);
  } else {
    for (const weekday of alarm.weekdays) {
      const id = await Notifications.scheduleNotificationAsync({
        content: commonContent,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: isoWeekdayToNotificationWeekday(weekday),
          hour: alarm.hour,
          minute: alarm.minute,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
      });
      ids.push(id);
    }
  }

  return ids;
}

async function scheduleAlarmNative(alarm: AppAlarm, interactive = true): Promise<AlarmDelivery> {
  const canNotify = await ensureAndroidNotificationPermission(interactive);
  if (!interactive && !canNotify) throw new Error("Notification permission not granted.");

  let permissions = await ExpoAlarm.getPermissionsAsync();

  if (interactive) {
    if (Platform.OS === "android" && !permissions.canScheduleExactAlarms) {
      permissions = await ExpoAlarm.requestPermissionsAsync();
    } else if (Platform.OS === "ios" && permissions.status !== "authorized" && permissions.status !== "unavailable") {
      permissions = await ExpoAlarm.requestPermissionsAsync();
    }
  } else if (
    (Platform.OS === "android" && !permissions.canScheduleExactAlarms) ||
    (Platform.OS === "ios" && permissions.status !== "authorized")
  ) {
    throw new Error("Alarm permission not granted.");
  }

  if (Platform.OS === "android" && !permissions.canScheduleExactAlarms) {
    alarm.notificationIds = await scheduleNotificationFallback(alarm);
    return "notification";
  }

  if (Platform.OS === "ios" && permissions.status !== "authorized") {
    alarm.notificationIds = await scheduleNotificationFallback(alarm);
    return "notification";
  }

  const sound = alarm.soundUri ? { soundUri: alarm.soundUri } : {};

  await ExpoAlarm.resetNativeAlarmCompletionAsync(alarm.id).catch(() => undefined);
  const scheduled = await ExpoAlarm.scheduleAlarmAsync({
    id: alarm.id,
    hour: alarm.hour,
    minute: alarm.minute,
    title: alarm.title,
    ...(alarm.weekdays.length > 0 ? { weekdays: alarm.weekdays } : {}),
    ios: {
      alertTitle: alarm.title,
      alertActionMode: "default",
      stopButtonTitle: "Stop",
      secondaryButtonTitle: "Open app",
      stopIntentBehavior: "recordOnly",
      secondaryButtonBehavior: "openApp",
      metadata: { alarmId: alarm.id, recordingId: alarm.recordingId ?? "" },
      ...sound,
    },
    android: {
      alertTitle: alarm.title,
      alertBody: alarm.recordingId ? "Your recording is playing." : "It's time.",
      alertActionMode: "default",
      metadata: { alarmId: alarm.id, recordingId: alarm.recordingId ?? "" },
      vibrate: true,
      fullScreen: true,
      fullScreenTarget: "native",
      ...sound,
      ...androidRingOptions(alarm.settings),
    },
  });

  void logAlarmEvent(
    `SCHEDULED ${alarm.hour}:${String(alarm.minute).padStart(2, "0")} armedFor=${new Date(scheduled.timestamp).toLocaleTimeString()} now=${new Date().toLocaleTimeString()}`,
  );

  if (Platform.OS === "android" && permissions.canUseFullScreenIntent === false) {
    return "native-no-full-screen";
  }
  return "native";
}

function buildNotice(alarm: AppAlarm, canNotify: boolean, soundFailed: boolean): string | undefined {
  const notices: string[] = [];
  if (!canNotify) {
    notices.push("Notifications are turned off for this app, so the alarm may not show or play. Enable them in Settings → Apps → VoiceNest → Notifications.");
  }
  if (soundFailed) {
    notices.push("Your recording couldn't be prepared as an alarm sound, so the default alarm sound will be used.");
  }
  if (alarm.delivery === "notification") {
    notices.push("This device is using a standard scheduled notification. It can sound while the app is closed, but snooze, volume and repeat settings only apply to full alarms.");
  } else if (alarm.delivery === "native-no-full-screen") {
    notices.push("The alarm is scheduled, but Android full-screen access is disabled. It may appear as a heads-up alert instead of taking over the lock screen.");
  }
  return notices.length > 0 ? notices.join(" ") : undefined;
}

export async function createAlarm(input: CreateAlarmInput): Promise<{ alarm: AppAlarm; notice?: string }> {
  const title = input.title.trim() || input.recordingTitle?.trim() || "Voice Note Alarm";
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new Error("Choose a valid hour.");
  }
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59) {
    throw new Error("Choose a valid minute.");
  }

  const canNotify = await ensureAndroidNotificationPermission();

  let soundUri: string | undefined;
  let soundFailed = false;
  if (input.recordingId && input.recordingUri) {
    try {
      soundUri = await prepareAlarmSound({
        id: input.recordingId,
        uri: input.recordingUri,
        durationMillis: input.recordingDurationMillis ?? 0,
      });
    } catch (error) {
      console.warn("Could not prepare alarm sound:", error);
      soundFailed = true;
    }
  }

  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
  const oneTimeDate = weekdays.length === 0 ? getNextOneTimeDate(input.hour, input.minute) : null;
  const alarm: AppAlarm = {
    id: createUuid(),
    title,
    hour: input.hour,
    minute: input.minute,
    weekdays,
    enabled: true,
    delivery: "notification",
    notificationIds: [],
    nextFireAt: oneTimeDate?.getTime() ?? null,
    createdAt: Date.now(),
    recordingId: input.recordingId,
    recordingUri: input.recordingUri,
    recordingTitle: input.recordingTitle ?? title,
    soundUri,
    settings: normalizeSettings({
      ...input.settings,
      recordingDurationMillis: input.recordingDurationMillis,
    }),
  };

  alarm.delivery = await scheduleAlarmNative(alarm);
  await saveAlarm(alarm);

  return { alarm, notice: buildNotice(alarm, canNotify, soundFailed) };
}

async function cancelScheduled(alarm: AppAlarm) {
  if (alarm.delivery === "notification") {
    await Promise.all(
      alarm.notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
    );
  } else {
    await ExpoAlarm.cancelNativeAlarmBackupAsync(alarm.id).catch(() => undefined);
    await ExpoAlarm.completeNativeAlarmAsync(alarm.id).catch(() => undefined);
    await ExpoAlarm.cancelAlarmAsync(alarm.id).catch(() => undefined);
  }
}

export async function updateAlarm(
  existing: AppAlarm,
  input: CreateAlarmInput,
): Promise<{ alarm: AppAlarm; notice?: string }> {
  const title = input.title.trim() || input.recordingTitle?.trim() || existing.title;
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new Error("Choose a valid hour.");
  }
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59) {
    throw new Error("Choose a valid minute.");
  }

  const canNotify = await ensureAndroidNotificationPermission();

  const recordingChanged = input.recordingId !== existing.recordingId;
  let soundUri = recordingChanged ? undefined : existing.soundUri;
  let soundFailed = false;
  if (input.recordingId && input.recordingUri && (recordingChanged || !soundUri)) {
    try {
      soundUri = await prepareAlarmSound({
        id: input.recordingId,
        uri: input.recordingUri,
        durationMillis: input.recordingDurationMillis ?? 0,
      });
    } catch (error) {
      console.warn("Could not prepare alarm sound:", error);
      soundFailed = true;
    }
  }

  if (existing.enabled) await cancelScheduled(existing);

  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
  const oneTimeDate = weekdays.length === 0 ? getNextOneTimeDate(input.hour, input.minute) : null;
  const alarm: AppAlarm = {
    ...existing,
    title,
    hour: input.hour,
    minute: input.minute,
    weekdays,
    enabled: true,
    delivery: "notification",
    notificationIds: [],
    nextFireAt: oneTimeDate?.getTime() ?? null,
    recordingId: input.recordingId,
    recordingUri: input.recordingUri,
    recordingTitle: input.recordingTitle ?? title,
    soundUri,
    settings: normalizeSettings({
      ...existing.settings,
      ...input.settings,
      recordingDurationMillis:
        input.recordingDurationMillis ?? existing.settings?.recordingDurationMillis,
    }),
  };

  alarm.delivery = await scheduleAlarmNative(alarm);
  await saveAlarm(alarm);

  if (recordingChanged && existing.recordingId) {
    const all = await readStoredAlarms();
    if (!all.some((item) => item.recordingId === existing.recordingId)) {
      releaseAlarmSound(existing.recordingId);
    }
  }

  return { alarm, notice: buildNotice(alarm, canNotify, soundFailed) };
}

export async function setAlarmEnabled(alarm: AppAlarm, enabled: boolean): Promise<AppAlarm> {
  if (enabled) {
    const nextFireAt = alarm.weekdays.length === 0
      ? getNextOneTimeDate(alarm.hour, alarm.minute).getTime()
      : null;
    const updated: AppAlarm = {
      ...alarm,
      enabled: true,
      nextFireAt,
      notificationIds: [],
      delivery: "notification",
    };

    updated.delivery = await scheduleAlarmNative(updated);
    await saveAlarm(updated);
    return updated;
  }

  await cancelScheduled(alarm);
  const updated: AppAlarm = { ...alarm, enabled: false, notificationIds: [] };
  await saveAlarm(updated);
  return updated;
}

export async function deleteAlarm(alarm: AppAlarm) {
  if (alarm.enabled) await cancelScheduled(alarm);

  await deleteAlarmRow(alarm.id);

  if (alarm.recordingId) {
    const remaining = await readStoredAlarms();
    if (!remaining.some((item) => item.recordingId === alarm.recordingId)) {
      releaseAlarmSound(alarm.recordingId);
    }
  }
}