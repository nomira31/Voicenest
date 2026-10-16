import { useAppDialog } from "@/components/ui/app-dialog";
import { useRecordings } from "@/contexts/recordings-context";
import {
  extractHttpsUrl,
  importDirectAudioUrl,
  isAudioImportCandidate,
  saveAudioImport,
} from "@/lib/audio/import-recording";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef } from "react";

/**
 * Listens for files/URLs shared into VoiceNest while the tabs and recording store are mounted.
 * The native share extension copies shared data to a temporary, app-readable location; this bridge
 * then copies supported audio into the permanent recordings directory through addRecording().
 */
export default function SharedAudioImportBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const { addRecording } = useRecordings();
  const { dialog, showAlert } = useAppDialog();
  const processing = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || processing.current || !shareIntent) return;
    processing.current = true;
    let cancelled = false;

    const processIntent = async () => {
      let imported = 0;
      const skipped: string[] = [];
      try {
        const sharedFiles = Array.isArray(shareIntent.files) ? shareIntent.files : [];
        const audioFiles = sharedFiles.filter((file) => isAudioImportCandidate({
          uri: file.path,
          name: file.fileName,
          mimeType: file.mimeType,
        }));

        for (const file of audioFiles) {
          try {
            await saveAudioImport({
              uri: file.path,
              name: file.fileName,
              mimeType: file.mimeType,
              durationMillis: typeof file.duration === "number" ? file.duration : undefined,
              sizeBytes: typeof file.size === "number" ? file.size : undefined,
            }, addRecording);
            imported += 1;
          } catch (importError) {
            skipped.push(importError instanceof Error ? importError.message : "An audio file could not be imported.");
          }
        }

        // Some apps share a direct audio URL rather than an actual file. Do not try to extract
        // audio from YouTube, Spotify, social-media pages, or streams requiring authentication.
        if (audioFiles.length === 0) {
          const sharedUrl = shareIntent.webUrl || extractHttpsUrl(shareIntent.text);
          if (sharedUrl) {
            try {
              await importDirectAudioUrl(sharedUrl, addRecording);
              imported += 1;
            } catch (importError) {
              skipped.push(importError instanceof Error ? importError.message : "The shared link is not a supported direct audio download.");
            }
          } else if (sharedFiles.length > 0) {
            skipped.push("The shared item is not a supported audio file.");
          } else if (error) {
            skipped.push("VoiceNest could not read the shared item. Try sharing the audio file itself.");
          } else {
            skipped.push("No audio file or direct audio link was included in the share.");
          }
        }

        if (!cancelled) {
          if (imported > 0) {
            void showAlert(
              "Audio received",
              `${imported} recording${imported === 1 ? " was" : "s were"} added to your VoiceNest library${skipped.length ? `; ${skipped.length} item(s) were skipped` : ""}.`,
            );
          } else {
            void showAlert("Could not import shared audio", skipped[0] ?? "This item could not be imported as audio.");
          }
        }
      } catch (unexpectedError) {
        console.error("Share-intent audio import failed:", unexpectedError);
        if (!cancelled) {
          void showAlert("Import failed", "VoiceNest could not process the shared item. Try importing it from the Library.");
        }
      } finally {
        resetShareIntent();
        processing.current = false;
      }
    };

    void processIntent();
    return () => {
      cancelled = true;
    };
  }, [addRecording, error, hasShareIntent, resetShareIntent, shareIntent, showAlert]);

  return <>{dialog}</>;
}
