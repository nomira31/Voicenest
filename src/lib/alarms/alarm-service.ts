import AsyncStorage from "@react-native-async-storage/async-storage";
import ExpoAlarm from "react-native-alarm-scheduler";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type AlarmWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: Monday=1, Sunday=7
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
};

const STORAGE_KEY = "voice-note.alarms.v1";
const CHANNEL_ID = "voice-note-alarms";

// Ensure alarms can be displayed if they fire while the app is foregrounded.
// If the app already defines a notification handler in its root layout, merge
// these foreground presentation flags into that handler instead of duplicating it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function createUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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
  };
}

async function readStoredAlarms(): Promise<AppAlarm[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeAlarm(item as Partial<AppAlarm>))
      .filter((item): item is AppAlarm => item !== null);
  } catch {
    return [];
  }
}

async function writeStoredAlarms(alarms: AppAlarm[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
}

export async function getAlarms(): Promise<AppAlarm[]> {
  const alarms = await readStoredAlarms();
  const now = Date.now();
  let nativeIds = new Set<string>();
  let notificationIds = new Set<string>();

  try {
    const [nativeAlarms, notificationRequests] = await Promise.all([
      ExpoAlarm.getScheduledAlarmsAsync(),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    nativeIds = new Set(nativeAlarms.map((alarm) => alarm.id));
    notificationIds = new Set(notificationRequests.map((request) => request.identifier));
  } catch (error) {
    // Keep the local list usable if the OS temporarily can't return schedules.
    console.warn("Could not reconcile native alarms:", error);
  }

  let changed = false;
  const updated = alarms.map((alarm) => {
    if (!alarm.enabled || alarm.weekdays.length > 0 || alarm.nextFireAt === null || alarm.nextFireAt > now) {
      return alarm;
    }

    const stillScheduled = alarm.delivery === "notification"
      ? alarm.notificationIds.some((id) => notificationIds.has(id))
      : nativeIds.has(alarm.id);

    // A one-time entry is marked inactive only if its delivery time passed
    // and the OS no longer reports it as scheduled.
    if (!stillScheduled) {
      changed = true;
      return { ...alarm, enabled: false, notificationIds: [] };
    }
    return alarm;
  });

  if (changed) await writeStoredAlarms(updated);
  return updated.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

export async function getAlarmPermissions() {
  try {
    return await ExpoAlarm.getPermissionsAsync();
  } catch (error) {
    console.warn("Native alarm permissions are unavailable:", error);
    return null;
  }
}

export async function requestAlarmPermissions() {
  const permissions = await ExpoAlarm.requestPermissionsAsync();

  if (Platform.OS === "android" && permissions.canUseFullScreenIntent === false) {
    // Full-screen permission is separate on Android 14+. The alarm may still
    // sound, but the lock-screen ring UI may be replaced by a heads-up alert.
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
  // expo-notifications calendar triggers use Sunday=1, Monday=2, ... Saturday=7.
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

  const ids: string[] = [];
  const commonContent = {
    title: alarm.title || "Alarm",
    body: "It's time.",
    sound: "default" as const,
    data: { alarmId: alarm.id, source: "voice-note-alarm" },
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

async function scheduleAlarmNative(alarm: AppAlarm): Promise<AlarmDelivery> {
  let permissions = await ExpoAlarm.getPermissionsAsync();

  if (Platform.OS === "android" && !permissions.canScheduleExactAlarms) {
    permissions = await ExpoAlarm.requestPermissionsAsync();
  } else if (Platform.OS === "ios" && permissions.status !== "authorized" && permissions.status !== "unavailable") {
    permissions = await ExpoAlarm.requestPermissionsAsync();
  }

  if (Platform.OS === "android" && !permissions.canScheduleExactAlarms) {
    const notificationIds = await scheduleNotificationFallback(alarm);
    alarm.notificationIds = notificationIds;
    return "notification";
  }

  if (Platform.OS === "ios" && permissions.status !== "authorized") {
    // On iOS versions without AlarmKit, use a local notification fallback.
    // It can notify with sound, but it is not a persistent full-screen alarm.
    const notificationIds = await scheduleNotificationFallback(alarm);
    alarm.notificationIds = notificationIds;
    return "notification";
  }

  await ExpoAlarm.resetNativeAlarmCompletionAsync(alarm.id).catch(() => undefined);
  await ExpoAlarm.scheduleAlarmAsync({
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
      metadata: { alarmId: alarm.id },
    },
    android: {
      alertTitle: alarm.title,
      alertBody: "It's time.",
      alertActionMode: "default",
      stopButtonTitle: "Stop",
      secondaryButtonTitle: "Open app",
      stopIntentBehavior: "recordOnly",
      secondaryButtonBehavior: "openApp",
      vibrate: true,
      fullScreen: true,
      fullScreenTarget: "native",
      maxRingDurationSeconds: 0,
    },
  });

  if (Platform.OS === "android" && permissions.canUseFullScreenIntent === false) {
    return "native-no-full-screen";
  }
  return "native";
}

export async function createAlarm(input: {
  title: string;
  hour: number;
  minute: number;
  weekdays: AlarmWeekday[];
}): Promise<{ alarm: AppAlarm; notice?: string }> {
  const title = input.title.trim() || "Voice Note Alarm";
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new Error("Choose a valid hour.");
  }
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59) {
    throw new Error("Choose a valid minute.");
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
  };

  alarm.delivery = await scheduleAlarmNative(alarm);
  const stored = await readStoredAlarms();
  await writeStoredAlarms([alarm, ...stored]);

  let notice: string | undefined;
  if (alarm.delivery === "notification") {
    notice = "This device is using a standard scheduled notification. It can sound while the app is closed, but it may not behave like a continuous full-screen alarm.";
  } else if (alarm.delivery === "native-no-full-screen") {
    notice = "The alarm is scheduled, but Android full-screen access is disabled. It may appear as a heads-up alert instead of taking over the lock screen.";
  }
  return { alarm, notice };
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
    const stored = await readStoredAlarms();
    await writeStoredAlarms(stored.map((item) => item.id === alarm.id ? updated : item));
    return updated;
  }

  if (alarm.delivery === "notification") {
    await Promise.all(
      alarm.notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
    );
  } else {
    await ExpoAlarm.cancelNativeAlarmBackupAsync(alarm.id).catch(() => undefined);
    await ExpoAlarm.completeNativeAlarmAsync(alarm.id).catch(() => undefined);
    await ExpoAlarm.cancelAlarmAsync(alarm.id);
  }

  const updated: AppAlarm = { ...alarm, enabled: false, notificationIds: [] };
  const stored = await readStoredAlarms();
  await writeStoredAlarms(stored.map((item) => item.id === alarm.id ? updated : item));
  return updated;
}

export async function deleteAlarm(alarm: AppAlarm) {
  if (alarm.enabled) {
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

  const remaining = (await readStoredAlarms()).filter((item) => item.id !== alarm.id);
  await writeStoredAlarms(remaining);
}
