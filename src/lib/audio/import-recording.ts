import { createAudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import type { RecordingRecord } from "@/lib/database";
import type { AddRecordingParams } from "@/contexts/recordings-context";

export type AddRecording = (params: AddRecordingParams) => Promise<RecordingRecord>;

export type AudioImportSource = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  durationMillis?: number | null;
  sizeBytes?: number | null;
};

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set([
  "mp3", "m4a", "m4b", "aac", "wav", "wave", "caf", "aif", "aiff",
  "3gp", "3gpp", "amr", "ogg", "opus", "flac", "webm", "mpga", "mpeg",
]);

const MIME_EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/x-caf": "caf",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/3gpp": "3gp",
  "audio/amr": "amr",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/opus": "opus",
  "audio/flac": "flac",
  "audio/webm": "webm",
  "audio/x-mpeg": "mp3",
};

function extensionFromName(value?: string | null): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const match = withoutQuery.match(/\.([a-z0-9]{2,6})$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase();
  return AUDIO_EXTENSIONS.has(extension) ? extension : null;
}

function extensionFromMime(mimeType?: string | null): string | null {
  if (!mimeType) return null;
  return MIME_EXTENSION[mimeType.split(";", 1)[0].trim().toLowerCase()] ?? null;
}

function safeTitle(value?: string | null): string {
  const withoutExtension = (value ?? "")
    .split(/[?#]/, 1)[0]
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[a-z0-9]{2,6}$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (withoutExtension || "Imported audio").slice(0, 80);
}

export function isAudioImportCandidate(source: Pick<AudioImportSource, "name" | "mimeType" | "uri">): boolean {
  const mimeType = source.mimeType?.split(";", 1)[0].trim().toLowerCase();
  if (mimeType?.startsWith("audio/")) return true;
  if (mimeType === "application/ogg") return true;
  return Boolean(extensionFromName(source.name) ?? extensionFromName(source.uri));
}

/**
 * Reads duration metadata without starting playback. Some codecs/providers don't expose duration;
 * for those files the saved duration remains 0 and the imported file is still retained.
 */
export async function readAudioDurationMillis(uri: string, timeoutMs = 5000): Promise<number> {
  let player: ReturnType<typeof createAudioPlayer> | null = null;
  try {
    player = createAudioPlayer(uri, { updateInterval: 250 });
    const currentDuration = () => Math.max(0, Number(player?.duration ?? 0) * 1000);
    if (currentDuration() > 0) return Math.round(currentDuration());

    return await new Promise<number>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let subscription: { remove: () => void } | undefined;
      const finish = (duration: number) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        subscription?.remove();
        resolve(Math.round(Math.max(0, duration)));
      };

      timer = setTimeout(() => finish(currentDuration()), timeoutMs);
      subscription = player!.addListener("playbackStatusUpdate", (status) => {
        if (status.duration > 0) finish(status.duration * 1000);
      });
      if (currentDuration() > 0) finish(currentDuration());
    });
  } catch {
    return 0;
  } finally {
    try {
      const managedPlayer = player as unknown as { remove?: () => void; release?: () => void } | null;
      if (typeof managedPlayer?.remove === "function") managedPlayer.remove();
      else if (typeof managedPlayer?.release === "function") managedPlayer.release();
    } catch {
      // Player cleanup is best-effort for unrecognized codecs.
    }
  }
}

export async function saveAudioImport(
  source: AudioImportSource,
  addRecording: AddRecording,
): Promise<RecordingRecord> {
  const nameExtension = extensionFromName(source.name);
  const uriExtension = extensionFromName(source.uri);
  const mimeExtension = extensionFromMime(source.mimeType);
  const extension = nameExtension ?? uriExtension ?? mimeExtension;
  if (!extension || !isAudioImportCandidate(source)) {
    throw new Error("This file does not appear to be a supported audio recording.");
  }

  if (typeof source.sizeBytes === "number" && source.sizeBytes > MAX_IMPORT_BYTES) {
    throw new Error("Audio files must be 100 MB or smaller.");
  }
  const input = new File(source.uri);
  if (!input.exists) {
    throw new Error("The selected audio file is no longer available. Please select or share it again.");
  }
  if (typeof input.size === "number" && input.size > MAX_IMPORT_BYTES) {
    throw new Error("Audio files must be 100 MB or smaller.");
  }

  const durationMillis = Number(source.durationMillis) > 0
    ? Math.round(Number(source.durationMillis))
    : await readAudioDurationMillis(source.uri);

  return addRecording({
    tempUri: source.uri,
    durationMillis,
    title: safeTitle(source.name),
    category: "Motivation",
    fileName: `${safeTitle(source.name)}.${extension}`,
    mimeType: source.mimeType ?? undefined,
  });
}

/**
 * Downloads a direct public audio file URL only. It does not extract audio from a streaming page,
 * defeat DRM, or work around login/paywall restrictions.
 */
export async function importDirectAudioUrl(
  rawUrl: string,
  addRecording: AddRecording,
): Promise<RecordingRecord> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid direct HTTPS audio-file URL.");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("For safety, audio links must use HTTPS and must not contain embedded credentials.");
  }

  let contentType: string | null = null;
  let contentLength: number | null = null;
  let head: Response | null = null;
  try {
    head = await fetch(url.toString(), { method: "HEAD" });
  } catch {
    // Some valid file servers do not support HEAD. Extension validation below remains required.
  }
  if (head?.ok) {
    contentType = head.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? null;
    const length = Number(head.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) contentLength = length;
    if (contentLength !== null && contentLength > MAX_IMPORT_BYTES) {
      throw new Error("Audio files must be 100 MB or smaller.");
    }
    if (
      contentType &&
      !contentType.startsWith("audio/") &&
      contentType !== "application/ogg" &&
      contentType !== "application/octet-stream"
    ) {
      throw new Error("That link is not a direct audio file. Paste a direct link to an audio download instead.");
    }
  }

  const extension = extensionFromName(url.pathname) ?? extensionFromMime(contentType);
  if (!extension) {
    throw new Error("The server did not identify this as a supported audio file. Use a direct HTTPS URL ending in an audio extension such as .mp3 or .m4a.");
  }

  const tempDirectory = new Directory(Paths.cache, "voicenest-audio-imports");
  if (!tempDirectory.exists) tempDirectory.create({ intermediates: true, idempotent: true });
  const fileName = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const destination = new File(tempDirectory, fileName);

  let downloaded: File | null = null;
  try {
    downloaded = await File.downloadFileAsync(url.toString(), destination);
    const downloadedSize = downloaded.size;
    if (!downloaded.exists || typeof downloadedSize !== "number" || downloadedSize <= 0) {
      throw new Error("The server returned an empty audio file.");
    }
    if (downloadedSize > MAX_IMPORT_BYTES) {
      throw new Error("Audio files must be 100 MB or smaller.");
    }

    const fileTitle = safeTitle(url.pathname.split("/").pop()) || "Imported audio";
    return await saveAudioImport({
      uri: downloaded.uri,
      name: `${fileTitle}.${extension}`,
      mimeType: contentType ?? undefined,
      sizeBytes: downloaded.size,
    }, addRecording);
  } finally {
    try {
      downloaded?.delete();
    } catch {
      // The cache file can be cleaned up later by the operating system.
    }
  }
}

export function extractHttpsUrl(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/https:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),.]+$/, "") ?? null;
}
