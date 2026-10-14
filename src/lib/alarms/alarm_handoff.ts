// lib/alarms/alarm-handoff.ts
//
// Call useAlarmHandoff() once in your root layout (app/_layout.tsx).
//
// When the user taps the big "Dismiss" / "Open app" button on the ring screen, Android keeps
// the alarm ringing and records a handoff. This hook picks that up on launch and whenever the
// app returns to the foreground, then ends the alarm for good: it cancels any pending snooze,
// stops the ring, and switches one-time alarms off.

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import ExpoAlarm from "react-native-alarm-scheduler";
import { logAlarmEvent } from "./alarm-log";
import { markAlarmFired } from "./alarm-service";

export function useAlarmHandoff(onDismissed?: (alarmId: string) => void) {
  const callback = useRef(onDismissed);
  callback.current = onDismissed;

  useEffect(() => {
    let cancelled = false;
    let busy = false;

    async function check() {
      if (busy) return;
      busy = true;
      try {
        const handoff = await ExpoAlarm.getPendingNativeAlarmHandoffAsync();
        if (!handoff || cancelled) return;

        // `trigger` marks the handoff recorded when the alarm merely started ringing.
        // Leave that one alone so the alarm keeps ringing until the user acts.
        if (handoff.trigger === true) return;

        if (handoff.action === "secondaryOpen") {
          await ExpoAlarm.cancelNativeAlarmBackupAsync(handoff.alarmId).catch(() => undefined);
          await ExpoAlarm.completeNativeAlarmAsync(handoff.alarmId);
          await markAlarmFired(handoff.alarmId);
          void logAlarmEvent(`DISMISSED ${handoff.alarmId}`);
          callback.current?.(handoff.alarmId);
        }

        await ExpoAlarm.clearPendingNativeAlarmHandoffAsync();
      } catch (error) {
        console.warn("Alarm handoff check failed:", error);
      } finally {
        busy = false;
      }
    }

    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}