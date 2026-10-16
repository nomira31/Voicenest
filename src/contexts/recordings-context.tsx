import { useAppDialog } from "@/components/ui/app-dialog";
import {
  deleteRecordingDb,
  fetchAllRecordings,
  insertRecording,
  type RecordingRecord,
  updateRecordingDb,
} from "@/lib/database";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface AddRecordingParams {
  tempUri: string;
  durationMillis: number;
  title?: string;
  category?: "People" | "Motivation" | "Reminders";
  fileName?: string;
  mimeType?: string;
}

interface RecordingsContextType {
  recordings: RecordingRecord[];
  isLoading: boolean;
  addRecording: (params: AddRecordingParams) => Promise<RecordingRecord>;
  removeRecording: (id: string, uri: string) => Promise<void>;
  toggleFavorite: (id: string, current: boolean) => Promise<void>;
  updateTitle: (id: string, newTitle: string) => Promise<void>;
  toggleSyncStatus: (id: string, current: boolean) => Promise<void>;
  currentPlayingId: string | null;
  isPlaying: boolean;
  playbackPositionSeconds: number;
  playbackDurationSeconds: number;
  isPlayerExpanded: boolean;
  playRecording: (id: string, uri: string) => void;
  pausePlayback: () => void;
  togglePlayback: () => void;
  seekPlayback: (seconds: number) => Promise<void>;
  expandPlayer: () => void;
  collapsePlayer: () => void;
  closePlayer: () => void;
}

const RecordingsContext = createContext<RecordingsContextType | undefined>(undefined);
const recordingsDirectory = new Directory(Paths.document, "recordings");

function removeLocalFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("Could not delete recording file:", error);
  }
}

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<RecordingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [activePlaybackUri, setActivePlaybackUri] = useState<string | null>(null);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const { dialog, showAlert } = useAppDialog();

  const player = useAudioPlayer(activePlaybackUri, { updateInterval: 100 });
  const playerStatus = useAudioPlayerStatus(player);

  const loadRecordings = useCallback(async () => {
    try {
      const records = await fetchAllRecordings();
      setRecordings(records);
    } catch (error) {
      console.error("Failed to load recordings from SQLite:", error);
      void showAlert("Library unavailable", "Your saved recordings could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  useEffect(() => {
    if (!activePlaybackUri) return;

    let cancelled = false;
    const startPlayback = async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
        });
        if (!cancelled) player.play();
      } catch (error) {
        console.error("Playback initialization failed:", error);
        if (!cancelled) {
          void showAlert("Playback unavailable", "This recording could not be played.");
        }
      }
    };

    void startPlayback();
    return () => {
      cancelled = true;
    };
  }, [activePlaybackUri, player, showAlert]);

  const playRecording = useCallback(
    (id: string, uri: string) => {
      setIsPlayerExpanded(true);

      if (currentPlayingId === id) {
        if (playerStatus.playing) {
          player.pause();
          return;
        }

        if (
          playerStatus.duration > 0 &&
          playerStatus.currentTime >= playerStatus.duration - 0.08
        ) {
          void player.seekTo(0).then(() => player.play()).catch((error) => {
            console.warn("Could not restart playback:", error);
          });
        } else {
          player.play();
        }
        return;
      }

      setCurrentPlayingId(id);
      setActivePlaybackUri(uri);
    },
    [currentPlayingId, player, playerStatus.currentTime, playerStatus.duration, playerStatus.playing],
  );

  const pausePlayback = useCallback(() => {
    player.pause();
  }, [player]);

  const togglePlayback = useCallback(() => {
    if (playerStatus.playing) {
      player.pause();
      return;
    }

    if (
      playerStatus.duration > 0 &&
      playerStatus.currentTime >= playerStatus.duration - 0.08
    ) {
      void player.seekTo(0).then(() => player.play()).catch((error) => {
        console.warn("Could not restart playback:", error);
      });
      return;
    }

    player.play();
  }, [player, playerStatus.currentTime, playerStatus.duration, playerStatus.playing]);

  const seekPlayback = useCallback(
    async (seconds: number) => {
      const nonNegativeSeconds = Math.max(0, seconds);
      const position = playerStatus.duration > 0
        ? Math.min(playerStatus.duration, nonNegativeSeconds)
        : nonNegativeSeconds;
      try {
        await player.seekTo(position);
      } catch (error) {
        console.warn("Could not seek in recording:", error);
      }
    },
    [player, playerStatus.duration],
  );

  const expandPlayer = useCallback(() => setIsPlayerExpanded(true), []);
  const collapsePlayer = useCallback(() => setIsPlayerExpanded(false), []);
  const closePlayer = useCallback(() => {
    player.pause();
    setCurrentPlayingId(null);
    setActivePlaybackUri(null);
    setIsPlayerExpanded(false);
  }, [player]);

  const addRecording = useCallback(
    async ({
      tempUri,
      durationMillis,
      title,
      category = "Motivation",
      fileName,
      mimeType,
    }: AddRecordingParams): Promise<RecordingRecord> => {
      const sourceFile = new File(tempUri);
      if (!sourceFile.exists) {
        throw new Error("The temporary recording file could not be found.");
      }

      if (!recordingsDirectory.exists) {
        recordingsDirectory.create({ intermediates: true, idempotent: true });
      }

      const extensionPattern = /\.([a-z0-9]{2,6})(?:[?#].*)?$/i;
      const explicitExtension = fileName?.match(extensionPattern)?.[1];
      const uriExtension = tempUri.split(/[?#]/, 1)[0].match(extensionPattern)?.[1];
      const mimeExtension: Record<string, string> = {
        "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
        "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav",
        "audio/x-wav": "wav", "audio/ogg": "ogg", "application/ogg": "ogg",
        "audio/opus": "opus", "audio/3gpp": "3gp", "audio/amr": "amr",
        "audio/flac": "flac", "audio/webm": "webm", "audio/x-caf": "caf",
      };
      const extension = `.${(explicitExtension || uriExtension || mimeExtension[mimeType?.split(";", 1)[0].toLowerCase() ?? ""] || "m4a").toLowerCase()}`;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const destinationFile = new File(recordingsDirectory, `recording_${id}${extension}`);

      sourceFile.copy(destinationFile);

      const surfaceMap = {
        Motivation: "surfaceSky" as const,
        People: "surfacePeach" as const,
        Reminders: "surfaceTeal" as const,
      };
      const iconMap = {
        Motivation: "sunny",
        People: "person",
        Reminders: "book",
      };

      const newRecord: RecordingRecord = {
        id,
        title: title || `Voice Moment ${new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        uri: destinationFile.uri,
        durationMillis,
        category,
        surface: surfaceMap[category],
        icon: iconMap[category],
        favorite: 0,
        synced: 0,
        createdAt: Date.now(),
      };

      try {
        await insertRecording(newRecord);
        setRecordings((previous) => [newRecord, ...previous]);
        return newRecord;
      } catch (error) {
        removeLocalFile(destinationFile.uri);
        throw error;
      }
    },
    [],
  );

  const removeRecording = useCallback(
    async (id: string, uri: string) => {
      try {
        if (currentPlayingId === id) closePlayer();
        await deleteRecordingDb(id);
        setRecordings((previous) => previous.filter((recording) => recording.id !== id));
        removeLocalFile(uri);
      } catch (error) {
        console.error("Delete failed:", error);
        void showAlert("Delete failed", "Could not remove this recording.");
      }
    },
    [closePlayer, currentPlayingId, showAlert],
  );

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    const nextValue = current ? 0 : 1;
    await updateRecordingDb(id, { favorite: nextValue });
    setRecordings((previous) => previous.map((recording) => (
      recording.id === id ? { ...recording, favorite: nextValue } : recording
    )));
  }, []);

  const updateTitle = useCallback(async (id: string, newTitle: string) => {
    await updateRecordingDb(id, { title: newTitle });
    setRecordings((previous) => previous.map((recording) => (
      recording.id === id ? { ...recording, title: newTitle } : recording
    )));
  }, []);

  const toggleSyncStatus = useCallback(async (id: string, current: boolean) => {
    const nextValue = current ? 0 : 1;
    await updateRecordingDb(id, { synced: nextValue });
    setRecordings((previous) => previous.map((recording) => (
      recording.id === id ? { ...recording, synced: nextValue } : recording
    )));
  }, []);

  return (
    <RecordingsContext.Provider
      value={{
        recordings,
        isLoading,
        addRecording,
        removeRecording,
        toggleFavorite,
        updateTitle,
        toggleSyncStatus,
        currentPlayingId,
        isPlaying: playerStatus.playing,
        playbackPositionSeconds: playerStatus.currentTime,
        playbackDurationSeconds: playerStatus.duration,
        isPlayerExpanded,
        playRecording,
        pausePlayback,
        togglePlayback,
        seekPlayback,
        expandPlayer,
        collapsePlayer,
        closePlayer,
      }}
    >
      {children}
      {dialog}
    </RecordingsContext.Provider>
  );
}

export function useRecordings() {
  const context = useContext(RecordingsContext);
  if (!context) {
    throw new Error("useRecordings must be used within a RecordingsProvider");
  }
  return context;
}
