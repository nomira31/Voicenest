import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "voice-note.alarm-log";
const MAX_LINES = 80;

// Writes are chained so concurrent calls can't overwrite each other's lines.
let queue: Promise<void> = Promise.resolve();

function timestamp() {
  const now = new Date();
  return `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

export function logAlarmEvent(message: string): Promise<void> {
  const line = `${timestamp()}  ${message}`;
  queue = queue.then(async () => {
    try {
      const existing = (await AsyncStorage.getItem(KEY)) ?? "";
      const lines = existing ? existing.split("\n") : [];
      lines.push(line);
      await AsyncStorage.setItem(KEY, lines.slice(-MAX_LINES).join("\n"));
    } catch {
      // Logging must never break the alarm.
    }
  });
  return queue;
}

export async function readAlarmLog() {
  await queue; // make sure pending writes are included
  return (await AsyncStorage.getItem(KEY)) ?? "(empty)";
}

export async function clearAlarmLog() {
  await queue;
  await AsyncStorage.removeItem(KEY);
}