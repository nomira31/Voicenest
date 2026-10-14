import { createEditedWav } from "@/lib/audio/trim-audio";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

// iOS only plays custom alarm/notification sounds shorter than 30 seconds.
const IOS_MAX_SOUND_MILLIS = 29_000;

type SoundSource = { id: string; uri: string; durationMillis: number };

function safeName(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getClipDirectory() {
  const dir = new Directory(Paths.document, "alarm-sounds");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function getIosSoundsDirectory() {
  // Notification sounds on iOS must live in <app container>/Library/Sounds.
  const dir = new Directory(Paths.document.parentDirectory, "Library", "Sounds");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function iosNotificationSoundName(recordingId: string) {
  return `voice-alarm-${safeName(recordingId)}.wav`;
}

/**
 * Returns the audio URI to hand to the alarm library.
 * Android: the full recording.
 * iOS: a WAV clip of the first 29 seconds (or the original if it already fits).
 * The full recording is never modified.
 */
export async function prepareAlarmSound(recording: SoundSource): Promise<string> {
  if (Platform.OS !== "ios") return recording.uri;

  const isWav = recording.uri.split("?")[0].toLowerCase().endsWith(".wav");
  if (isWav && recording.durationMillis <= IOS_MAX_SOUND_MILLIS) return recording.uri;

  const clip = new File(getClipDirectory(), `${safeName(recording.id)}.wav`);
  if (clip.exists) return clip.uri;

  const ratio = Math.min(1, IOS_MAX_SOUND_MILLIS / Math.max(1, recording.durationMillis));
  const edited = await createEditedWav(recording.uri, 0, ratio, false);
  const temp = new File(edited.uri);
  try {
    temp.copy(clip);
  } finally {
    try {
      if (temp.exists) temp.delete();
    } catch {
      // Cache cleanup is best effort.
    }
  }
  return clip.uri;
}

/**
 * iOS notification fallback only: copies the clip into Library/Sounds and returns
 * the file name to use as the notification sound. Returns null if it can't be prepared.
 */
export async function ensureIosNotificationSound(
  soundUri: string,
  recordingId: string,
): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const name = iosNotificationSoundName(recordingId);
    const target = new File(getIosSoundsDirectory(), name);
    if (!target.exists) new File(soundUri).copy(target);
    return name;
  } catch (error) {
    console.warn("Could not prepare iOS notification sound:", error);
    return null;
  }
}

/** Removes generated clips once no alarm uses the recording any more. */
export function releaseAlarmSound(recordingId: string) {
  try {
    const clip = new File(getClipDirectory(), `${safeName(recordingId)}.wav`);
    if (clip.exists) clip.delete();
  } catch (error) {
    console.warn("Could not remove alarm clip:", error);
  }

  if (Platform.OS === "ios") {
    try {
      const copy = new File(getIosSoundsDirectory(), iosNotificationSoundName(recordingId));
      if (copy.exists) copy.delete();
    } catch (error) {
      console.warn("Could not remove iOS alarm sound:", error);
    }
  }
}