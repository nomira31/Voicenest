import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const MAX_LOOP_MS = 5 * 60 * 1000;

let player: AudioPlayer | null = null;
let activeAlarmId: string | null = null;
let capTimer: ReturnType<typeof setTimeout> | null = null;
// Incremented on every start/stop so a stop during async setup cancels the start.
let generation = 0;

/** Fallback: loops the recording in-app. Starts immediately and stops after 5 minutes. */
export async function startAlarmLoop(alarmId: string, uri: string) {
  // Same alarm already sounding or starting: don't restart it.
  if (activeAlarmId === alarmId) return;

  stopAlarmLoop();
  const myGeneration = ++generation;
  activeAlarmId = alarmId;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });

    // The user pressed Stop (or another alarm took over) while we were setting up.
    if (myGeneration !== generation) return;

    const next = createAudioPlayer(uri);
    next.loop = true;
    next.volume = 1;
    next.play();
    player = next;
    capTimer = setTimeout(() => stopAlarmLoop(alarmId), MAX_LOOP_MS);
  } catch (error) {
    console.warn("Fallback alarm playback failed:", error);
    if (myGeneration === generation) activeAlarmId = null;
  }
}

export function stopAlarmLoop(alarmId?: string) {
  if (alarmId && activeAlarmId && alarmId !== activeAlarmId) return;

  generation += 1;
  activeAlarmId = null;

  if (capTimer) {
    clearTimeout(capTimer);
    capTimer = null;
  }

  const current = player;
  player = null;
  if (!current) return;

  try {
    current.pause();
  } catch {
    // Already stopped.
  }
  try {
    current.remove();
  } catch {
    // Already released.
  }
}

export function isAlarmLoopActive() {
  return activeAlarmId !== null;
}