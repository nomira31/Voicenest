import { useRecordings } from "@/contexts/recordings-context";
import { logAlarmEvent } from "@/lib/alarms/alarm-log";
import { startAlarmLoop, stopAlarmLoop } from "@/lib/alarms/alarm-player";
import {
  getAlarmById,
  isNativeAlarmRinging,
  markAlarmFired,
  restoreAlarms,
} from "@/lib/alarms/alarm-service";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import ExpoAlarm, { type AlarmAction } from "react-native-alarm-scheduler";

const RECEIVED_MAX_AGE_MS = 2 * 60 * 1000; // a delivery that just arrived
const TAPPED_MAX_AGE_MS = 10 * 60 * 1000; // a tap on a recent notification

// Survives re-renders so the same delivery is never played twice.
const handledNotifications = new Set<string>();

function notificationAgeMs(notification: Notifications.Notification) {
  // `date` is epoch milliseconds (guard against seconds).
  const raw = notification.date;
  const millis = raw < 1e12 ? raw * 1000 : raw;
  return Date.now() - millis;
}

export function useAlarmPlayback() {
  const { recordings, playRecording } = useRecordings();
  const recordingsRef = useRef(recordings);
  recordingsRef.current = recordings;
  const playRef = useRef(playRecording);
  playRef.current = playRecording;

  // Restore alarms the OS lost (update, cleared data) once per app start.
  useEffect(() => {
    void logAlarmEvent("APP hook mounted");
    void restoreAlarms();
  }, []);

  // Notification fallback: play the linked recording when a *recent* alarm notification arrives or is tapped.
  useEffect(() => {
    function play(notification: Notifications.Notification, maxAgeMs: number, source: string) {
      const data = notification.request.content.data as
        | { source?: string; recordingId?: string | null; recordingUri?: string | null }
        | undefined;
      if (data?.source !== "voice-note-alarm") return;

      const key = `${notification.request.identifier}:${notification.date}`;
      if (handledNotifications.has(key)) return;
      handledNotifications.add(key);

      const age = notificationAgeMs(notification);
      void logAlarmEvent(`NOTIFICATION ${source} ageMs=${Math.round(age)}`);

      // Old notifications (for example the last one before a cold start) must not replay.
      if (age > maxAgeMs) return;

      const recording = recordingsRef.current.find((item) => item.id === data.recordingId);
      const id = recording?.id ?? data.recordingId;
      const uri = recording?.uri ?? data.recordingUri;
      if (id && uri) void playRef.current(id, uri);
    }

    const last = Notifications.getLastNotificationResponse();
    if (last) play(last.notification, TAPPED_MAX_AGE_MS, "last-response");

    const received = Notifications.addNotificationReceivedListener((n) =>
      play(n, RECEIVED_MAX_AGE_MS, "received"),
    );
    const response = Notifications.addNotificationResponseReceivedListener((r) =>
      play(r.notification, TAPPED_MAX_AGE_MS, "tapped"),
    );

    return () => {
      received.remove();
      response.remove();
    };
  }, []);

  // Native alarms: start the recording the instant the alarm fires, and mark one-time alarms done.
  useEffect(() => {
    let disposed = false;

    async function onAlarmFired(alarmId: string) {
      // Don't make the sound wait for bookkeeping.
      void markAlarmFired(alarmId);

      const alarm = await getAlarmById(alarmId);

      // How late was this alarm delivered compared with the stored hh:mm?
      if (alarm) {
        const expected = new Date();
        expected.setHours(alarm.hour, alarm.minute, 0, 0);
        void logAlarmEvent(
          `LATENESS ${alarm.hour}:${String(alarm.minute).padStart(2, "0")} delivery=${alarm.delivery} lateMs=${Date.now() - expected.getTime()}`,
        );
      }

      const uri = alarm?.recordingUri ?? alarm?.soundUri;
      if (!uri || disposed) {
        void logAlarmEvent(`FIRED ${alarmId} no audio uri (alarm found: ${alarm ? "yes" : "no"})`);
        return;
      }

      // Start immediately: the user must never wait for a status check.
      await startAlarmLoop(alarmId, uri);
      void logAlarmEvent(`FALLBACK started for ${alarmId}`);

      // If the native ring service is genuinely ringing, drop ours to avoid double audio.
      const ringing = await isNativeAlarmRinging(alarmId);
      void logAlarmEvent(`NATIVE ringing=${String(ringing)}`);
      if (ringing === true && !disposed) {
        stopAlarmLoop(alarmId);
        void logAlarmEvent("FALLBACK stopped because native is ringing");
      }
    }

    async function handleAction(action: AlarmAction) {
      console.log("ALARM ACTION", action.action, action.alarmId, action.trigger ? "(trigger)" : "");
      void logAlarmEvent(`ACTION ${action.action} ${action.trigger ? "(trigger)" : ""}`);

      // Any user action that ends the alert also ends the fallback sound.
      if (action.action === "nativeStop" || action.action === "dismiss" || action.action === "snooze") {
        stopAlarmLoop(action.alarmId);
        return;
      }

      // `trigger` marks the handoff recorded when the alarm started ringing, not a user tap.
      if (action.action !== "secondaryOpen" || action.trigger) return;
      stopAlarmLoop(action.alarmId);
      await ExpoAlarm.completeNativeAlarmAsync(action.alarmId).catch(() => undefined);
      await ExpoAlarm.clearPendingAlarmActionsAsync([action.id]).catch(() => undefined);
    }

    const actionSub = ExpoAlarm.addListener("onAlarmAction", (action) => {
      void handleAction(action);
    });

    const triggeredSub = ExpoAlarm.addListener("onAlarmTriggered", (alarm) => {
      console.log("ALARM TRIGGERED", alarm.id);
      // armedFor = the time the native side scheduled this alarm for.
      void logAlarmEvent(
        `TRIGGERED ${alarm.id} armedFor=${new Date(alarm.timestamp).toLocaleTimeString()}`,
      );
      void onAlarmFired(alarm.id);
    });

    const stateSub = ExpoAlarm.addListener("onAlarmStateChange", (event) => {
      console.log("ALARM STATE", event.state, event.id);
      void logAlarmEvent(`STATE ${event.state} ${event.id}`);
    });

    // App launched from an alarm while it was closed.
    ExpoAlarm.getPendingNativeAlarmHandoffAsync()
      .then(async (handoff) => {
        if (!handoff) return;
        void logAlarmEvent("PENDING handoff found on launch");
        await handleAction(handoff);
        await ExpoAlarm.clearPendingNativeAlarmHandoffAsync().catch(() => undefined);
      })
      .catch(() => undefined);

    // App started while an alarm is already alerting.
    ExpoAlarm.getCurrentAlarmContextAsync()
      .then((context) => {
        if (context?.state === "alerting") {
          void logAlarmEvent(`LAUNCH while alerting ${context.id}`);
          void onAlarmFired(context.id);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      actionSub.remove();
      triggeredSub.remove();
      stateSub.remove();
    };
  }, []);
}