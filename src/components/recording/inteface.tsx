import { TagSelector } from "@/components/tags/tag-selector";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Fonts,
  Layout,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
  useResponsiveLayout,
  type Theme,
} from "@/constants/theme";
import { useRecordings } from "@/contexts/recordings-context";
import { createEditedWav, type ProcessedAudio } from "@/lib/audio/trim-audio";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const WAVEFORM_BARS = 38;
const METER_POLL_MS = 100;
const TRIM_HANDLE_WIDTH = 22;
const MIN_TRIM_MILLIS = 500;
const DEFAULT_WAVE_PATTERN = [
  6, 10, 15, 24, 33, 40, 46, 42, 35, 24, 16, 22, 34, 44, 48, 38, 26, 17, 14,
  20, 29, 39, 36, 28, 21, 16, 12, 8, 6, 5, 4, 4, 4, 4,
];
const IDLE_BAR_HEIGHT = 10;
const RECORDER_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};
const PLAYER_OPTIONS = { updateInterval: 100 };

type RecordingState = "idle" | "recording" | "paused" | "review";
type RecordingMime = "audio/wav" | "audio/m4a";
type CachedAudio = ProcessedAudio & { key: string };

interface RecordScreenProps {
  onClose?: () => void;
}

function defaultRecordingName() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Voice Moment · ${timeStr}`;
}

function formatTime(millis: number) {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMinimumTrimRatio(durationMillis: number) {
  if (durationMillis <= MIN_TRIM_MILLIS) return 1;
  return Math.min(1, MIN_TRIM_MILLIS / durationMillis);
}

function compressWaveform(values: number[], count: number) {
  if (!values.length) {
    return Array.from(
      { length: count },
      (_, index) => DEFAULT_WAVE_PATTERN[index % DEFAULT_WAVE_PATTERN.length],
    );
  }

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * values.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * values.length));
    const section = values.slice(start, end);
    if (!section.length) return IDLE_BAR_HEIGHT;
    return Math.max(
      5,
      Math.min(48, Math.round(section.reduce((sum, item) => sum + item, 0) / section.length)),
    );
  });
}

function deleteLocalFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("Could not delete temporary recording:", error);
  }
}

export default function RecordScreen({ onClose }: RecordScreenProps) {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const responsive = useResponsiveLayout();
  const isWide = responsive.isTablet || responsive.width >= 720;
  const styles = useMemo(
    () => createStyles(colors, isDark, responsive, isWide),
    [colors, isDark, responsive, isWide],
  );

  const router = useRouter();
  const { addRecording, pausePlayback } = useRecordings();
  const { dialog, showAlert, showConfirm } = useAppDialog();

  const [recordState, setRecordState] = useState<RecordingState>("idle");
  const [durationMillis, setDurationMillis] = useState(0);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingTitle, setRecordingTitle] = useState<string>(() => defaultRecordingName());
  const [selectedTags, setSelectedTags] = useState<string[]>(["Motivation"]);
  const [trimStartRatio, setTrimStartRatio] = useState(0);
  const [trimEndRatio, setTrimEndRatio] = useState(1);
  const [voiceCleanupEnabled, setVoiceCleanupEnabled] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(0.85);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [playbackPositionSeconds, setPlaybackPositionSeconds] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("Saving recording...");

  const rippleAnim = useRef(new Animated.Value(0)).current;
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const player = useAudioPlayer(null, PLAYER_OPTIONS);
  const playerStatus = useAudioPlayerStatus(player);

  const recorderRef = useRef(recorder);
  const playerRef = useRef(player);
  const playerStatusRef = useRef(playerStatus);
  const recordedUriRef = useRef(recordedUri);
  const recordStateRef = useRef(recordState);
  const waveformSamplesRef = useRef<number[]>([]);
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const didHandlePlaybackEndRef = useRef(false);
  const trimStartRatioRef = useRef(trimStartRatio);
  const trimEndRatioRef = useRef(trimEndRatio);
  const totalDurationRef = useRef(durationMillis);
  const leftDragStartRef = useRef(0);
  const rightDragStartRef = useRef(1);
  const processedCacheRef = useRef<CachedAudio | null>(null);
  const trimmerWidthRef = useRef(320);

  recorderRef.current = recorder;
  playerRef.current = player;
  playerStatusRef.current = playerStatus;
  recordedUriRef.current = recordedUri;
  recordStateRef.current = recordState;
  trimStartRatioRef.current = trimStartRatio;
  trimEndRatioRef.current = trimEndRatio;
  totalDurationRef.current = durationMillis;

  const isReviewMode = recordState === "review";
  const currentSeconds = playbackPositionSeconds;
  const durationSeconds = Math.max(0, durationMillis / 1000);
  const startMillis = durationMillis * trimStartRatio;
  const endMillis = durationMillis * trimEndRatio;
  const selectedDurationMillis = Math.max(0, endMillis - startMillis);
  const startSeconds = startMillis / 1000;
  const endSeconds = Math.max(startSeconds + 0.01, endMillis / 1000);
  const displayedPlaybackMillis = clamp(
    currentSeconds * 1000,
    startMillis,
    Math.max(startMillis, endMillis),
  );
  const waveformBars = useMemo(
    () => compressWaveform(waveformSamples, WAVEFORM_BARS),
    [waveformSamples],
  );
  const sourceExtension = recordedUri?.split("?")[0].toLowerCase() ?? "";
  const originalMimeType: RecordingMime = sourceExtension.endsWith(".wav")
    ? "audio/wav"
    : "audio/m4a";

  const dismiss = useCallback(() => {
    if (onClose) onClose();
    else router.back();
  }, [onClose, router]);

  const cleanupAudio = useCallback(async () => {
    try {
      const status = recorderRef.current.getStatus();
      if (
        status.isRecording ||
        recordStateRef.current === "recording" ||
        recordStateRef.current === "paused"
      ) {
        await recorderRef.current.stop();
      }
    } catch {
      // Ignored
    }

    try {
      playerRef.current.pause();
    } catch {
      // Ignored
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    if (recordState === "recording") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(rippleAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(rippleAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }

    rippleAnim.stopAnimation();
    Animated.timing(rippleAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();
  }, [recordState, rippleAnim]);

  useEffect(() => {
    if (recordState !== "recording") return;

    const id = setInterval(() => {
      let status;
      try {
        status = recorderRef.current.getStatus();
      } catch {
        return;
      }

      if (typeof status.durationMillis === "number") {
        setDurationMillis(status.durationMillis);
      }

      if (typeof status.metering === "number" && Number.isFinite(status.metering)) {
        const db = clamp(status.metering, -55, 0);
        const power = Math.pow((db + 55) / 55, 1.4);
        const normalized = Math.max(5, Math.round(5 + power * 43));
        const nextSamples = [...waveformSamplesRef.current, normalized].slice(-6000);
        waveformSamplesRef.current = nextSamples;
        setWaveformSamples(nextSamples);
      }
    }, METER_POLL_MS);

    return () => clearInterval(id);
  }, [recordState]);

  useEffect(() => {
    if (recordState !== "review") return;

    const id = setInterval(() => {
      try {
        const position = playerRef.current.currentTime;
        if (typeof position === "number" && Number.isFinite(position)) {
          setPlaybackPositionSeconds(position);
        }
      } catch {
        // Ignored
      }
    }, PLAYER_OPTIONS.updateInterval);

    return () => clearInterval(id);
  }, [recordState]);

  useEffect(() => {
    if (
      recordState !== "review" ||
      !playerStatus.playing ||
      durationSeconds <= 0 ||
      currentSeconds < endSeconds - 0.05 ||
      didHandlePlaybackEndRef.current
    ) {
      return;
    }

    didHandlePlaybackEndRef.current = true;
    player.pause();
    void player.seekTo(endSeconds).then(() => {
      setPlaybackPositionSeconds(endSeconds);
      setScrubPosition(endSeconds);
    }).catch(() => undefined);
  }, [currentSeconds, durationSeconds, endSeconds, player, playerStatus.playing, recordState]);

  useEffect(() => {
    if (isScrubbing || recordState !== "review") return;
    setScrubPosition(clamp(currentSeconds, startSeconds, endSeconds));
  }, [currentSeconds, endSeconds, isScrubbing, recordState, startSeconds]);

  useEffect(() => {
    if (recordState !== "review" || !playerStatus.isLoaded || playerStatus.duration <= 0) return;
    const actualDuration = playerStatus.duration * 1000;
    if (Math.abs(actualDuration - durationMillis) > 250) {
      setDurationMillis(actualDuration);
    }
  }, [durationMillis, playerStatus.duration, playerStatus.isLoaded, recordState]);

  useEffect(() => {
    if (!playerStatus.isLoaded) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate);
      playerRef.current.volume = volume;
    } catch {
      // Ignored
    }
  }, [playerStatus.isLoaded, playbackRate, volume]);

  const startRecording = useCallback(async () => {
    if (isStartingRef.current || isStoppingRef.current) return;
    isStartingRef.current = true;
    const previousUri = recordedUriRef.current;
    const previousProcessedUri = processedCacheRef.current?.uri;
    processedCacheRef.current = null;

    try {
      pausePlayback();
      try {
        playerRef.current.pause();
      } catch {
        // Ignored
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();

      if (!isMountedRef.current) {
        await recorderRef.current.stop().catch(() => undefined);
        return;
      }

      waveformSamplesRef.current = [];
      setWaveformSamples([]);
      setDurationMillis(0);
      setRecordedUri(null);
      setRecordingTitle(defaultRecordingName());
      trimStartRatioRef.current = 0;
      trimEndRatioRef.current = 1;
      setTrimStartRatio(0);
      setTrimEndRatio(1);
      setVoiceCleanupEnabled(false);
      setScrubPosition(0);
      setPlaybackPositionSeconds(0);
      didHandlePlaybackEndRef.current = false;
      setPlaybackRate(1);
      setRecordState("recording");

      if (previousUri) deleteLocalFile(previousUri);
      if (previousProcessedUri && previousProcessedUri !== previousUri) {
        deleteLocalFile(previousProcessedUri);
      }
    } catch (error) {
      console.warn("Recording start error:", error);
      if (isMountedRef.current) {
        void showAlert(
          "Recording Error",
          "Unable to start microphone recording. Check microphone permission and try again.",
        );
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [pausePlayback, showAlert]);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const initialize = async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (cancelled) return;

        if (!permission.granted) {
          void showAlert(
            "Microphone Permission",
            "Enable microphone access in settings to record audio.",
          ).then(dismiss);
          return;
        }

        await startRecording();
      } catch (error) {
        console.warn("Recording initialization error:", error);
        if (!cancelled) {
          void showAlert("Audio Error", "The microphone could not be initialized.").then(dismiss);
        }
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      isMountedRef.current = false;
      void cleanupAudio();
    };
  }, [cleanupAudio, dismiss, showAlert, startRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") return;

      if (recordStateRef.current === "recording") {
        try {
          recorderRef.current.pause();
          const status = recorderRef.current.getStatus();
          if (typeof status.durationMillis === "number") setDurationMillis(status.durationMillis);
          setRecordState("paused");
        } catch (error) {
          console.warn("Could not pause recording during interruption:", error);
        }
      }

      try {
        playerRef.current.pause();
      } catch {
        // Ignored
      }
    });

    return () => subscription.remove();
  }, []);

  const handlePauseResume = useCallback(() => {
    if (isStartingRef.current || isStoppingRef.current) return;

    try {
      if (recordStateRef.current === "recording") {
        recorderRef.current.pause();
        const status = recorderRef.current.getStatus();
        if (typeof status.durationMillis === "number") setDurationMillis(status.durationMillis);
        setRecordState("paused");
      } else if (recordStateRef.current === "paused") {
        recorderRef.current.record();
        setRecordState("recording");
      }
    } catch (error) {
      console.warn("Pause/resume error:", error);
      void showAlert("Recording Error", "The recording state could not be changed.");
    }
  }, [showAlert]);

  const handleFinish = useCallback(async () => {
    if (isStoppingRef.current || isStartingRef.current) return;
    isStoppingRef.current = true;

    try {
      const status = recorderRef.current.getStatus();
      const finalDuration =
        typeof status.durationMillis === "number" ? status.durationMillis : durationMillis;
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;

      if (!uri) {
        void showAlert("Recording Error", "No audio file was created. Try recording again.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });

      playerRef.current.replace(uri);
      playerRef.current.setPlaybackRate(playbackRate);
      playerRef.current.volume = volume;
      didHandlePlaybackEndRef.current = false;
      setPlaybackPositionSeconds(0);
      setDurationMillis(finalDuration);
      setRecordedUri(uri);
      setRecordingTitle((prev) => prev.trim() || defaultRecordingName());
      trimStartRatioRef.current = 0;
      trimEndRatioRef.current = 1;
      setTrimStartRatio(0);
      setTrimEndRatio(1);
      setVoiceCleanupEnabled(false);
      setScrubPosition(0);
      setRecordState("review");
    } catch (error) {
      console.warn("Recording stop error:", error);
      void showAlert("Recording Error", "The recording could not be finalized.");
    } finally {
      isStoppingRef.current = false;
    }
  }, [durationMillis, playbackRate, showAlert, volume]);

  const handleTogglePlayback = useCallback(async () => {
    const activePlayer = playerRef.current;
    const status = playerStatusRef.current;
    if (!recordedUriRef.current) return;

    if (status.playing) {
      activePlayer.pause();
      return;
    }

    let position = playbackPositionSeconds;
    try {
      position = activePlayer.currentTime;
    } catch {
      // Ignored
    }

    didHandlePlaybackEndRef.current = false;
    if (position < startSeconds - 0.05 || position >= endSeconds - 0.05) {
      await activePlayer.seekTo(startSeconds);
      setPlaybackPositionSeconds(startSeconds);
      setScrubPosition(startSeconds);
    }
    activePlayer.play();
  }, [endSeconds, playbackPositionSeconds, startSeconds]);

  const invalidateProcessedCache = useCallback(() => {
    const cached = processedCacheRef.current;
    processedCacheRef.current = null;
    if (cached && cached.uri !== recordedUriRef.current) {
      deleteLocalFile(cached.uri);
    }
  }, []);

  const moveTrimStart = useCallback((nextRatio: number) => {
    const minimumRatio = getMinimumTrimRatio(totalDurationRef.current);
    const bounded = clamp(nextRatio, 0, Math.max(0, trimEndRatioRef.current - minimumRatio));
    trimStartRatioRef.current = bounded;
    setTrimStartRatio(bounded);
    invalidateProcessedCache();
  }, [invalidateProcessedCache]);

  const moveTrimEnd = useCallback((nextRatio: number) => {
    const minimumRatio = getMinimumTrimRatio(totalDurationRef.current);
    const bounded = clamp(nextRatio, Math.min(1, trimStartRatioRef.current + minimumRatio), 1);
    trimEndRatioRef.current = bounded;
    setTrimEndRatio(bounded);
    invalidateProcessedCache();
  }, [invalidateProcessedCache]);

  const leftPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        leftDragStartRef.current = trimStartRatioRef.current;
        playerRef.current.pause();
      },
      onPanResponderMove: (_, gesture) => {
        const width = Math.max(1, trimmerWidthRef.current - TRIM_HANDLE_WIDTH);
        moveTrimStart(leftDragStartRef.current + gesture.dx / width);
      },
      onPanResponderRelease: () => {
        const current = playerRef.current.currentTime;
        const start = (totalDurationRef.current * trimStartRatioRef.current) / 1000;
        const end = (totalDurationRef.current * trimEndRatioRef.current) / 1000;
        if (current < start || current > end) void playerRef.current.seekTo(start);
      },
    }),
  ).current;

  const rightPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        rightDragStartRef.current = trimEndRatioRef.current;
        playerRef.current.pause();
      },
      onPanResponderMove: (_, gesture) => {
        const width = Math.max(1, trimmerWidthRef.current - TRIM_HANDLE_WIDTH);
        moveTrimEnd(rightDragStartRef.current + gesture.dx / width);
      },
      onPanResponderRelease: () => {
        const current = playerRef.current.currentTime;
        const start = (totalDurationRef.current * trimStartRatioRef.current) / 1000;
        const end = (totalDurationRef.current * trimEndRatioRef.current) / 1000;
        if (current < start || current > end) void playerRef.current.seekTo(start);
      },
    }),
  ).current;

  const getProcessedOutput = useCallback(async (): Promise<ProcessedAudio> => {
    const uri = recordedUriRef.current;
    if (!uri) throw new Error("There is no recording to export.");

    const startRatio = trimStartRatioRef.current;
    const endRatio = trimEndRatioRef.current;
    const needsProcessing = voiceCleanupEnabled || startRatio > 0 || endRatio < 1;

    if (!needsProcessing) {
      return {
        uri,
        durationMillis: totalDurationRef.current,
        isWav: uri.toLowerCase().split("?")[0].endsWith(".wav"),
      };
    }

    const key = `${uri}|${startRatio.toFixed(5)}|${endRatio.toFixed(5)}|${voiceCleanupEnabled ? 1 : 0}`;
    if (processedCacheRef.current?.key === key) return processedCacheRef.current;

    const cachedBefore = processedCacheRef.current;
    processedCacheRef.current = null;
    if (cachedBefore && cachedBefore.uri !== uri) deleteLocalFile(cachedBefore.uri);

    const edited = await createEditedWav(uri, startRatio, endRatio, voiceCleanupEnabled);
    const cached: CachedAudio = { ...edited, key };
    processedCacheRef.current = cached;
    return cached;
  }, [voiceCleanupEnabled]);

  const handleSaveRecording = useCallback(async () => {
    const uri = recordedUriRef.current;
    if (!uri || isProcessing) return;

    const cleanTitle = recordingTitle.trim() || defaultRecordingName();
    const primaryCategory = selectedTags[0] || "Motivation";

    setIsProcessing(true);
    setProcessingLabel("Saving recording...");

    try {
      playerRef.current.pause();
      const output = await getProcessedOutput();
      await addRecording({
        tempUri: output.uri,
        durationMillis: output.durationMillis,
        title: cleanTitle,
        category: primaryCategory,
        tags: selectedTags.length > 0 ? selectedTags : [primaryCategory],
      } as any);
      if (output.uri !== uri) {
        deleteLocalFile(output.uri);
        processedCacheRef.current = null;
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      }).catch(() => undefined);
      dismiss();
    } catch (error) {
      console.error("Save recording error:", error);
      void showAlert(
        "Could Not Save",
        error instanceof Error ? error.message : "The recording could not be saved.",
      );
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    addRecording,
    dismiss,
    getProcessedOutput,
    isProcessing,
    recordingTitle,
    selectedTags,
    showAlert,
  ]);

  const handleExport = useCallback(async () => {
    const uri = recordedUriRef.current;
    if (!uri || isProcessing) return;

    setIsProcessing(true);
    setProcessingLabel("Preparing export...");

    try {
      playerRef.current.pause();
      const output = await getProcessedOutput();
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        void showAlert("Export Unavailable", "Audio sharing is not available on this device.");
        return;
      }

      const mimeType = output.isWav ? "audio/wav" : originalMimeType;
      await Sharing.shareAsync(output.uri, {
        mimeType,
        dialogTitle: recordingTitle.trim() || "Export voice recording",
        UTI: output.isWav ? "com.microsoft.waveform-audio" : "public.audio",
      });
    } catch (error) {
      console.error("Export recording error:", error);
      void showAlert(
        "Export Failed",
        error instanceof Error ? error.message : "The audio could not be exported.",
      );
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [getProcessedOutput, isProcessing, originalMimeType, recordingTitle, showAlert]);

  const handleCancel = useCallback(async () => {
    const confirmed = await showConfirm(
      "Discard recording?",
      "Your unsaved recording will be deleted.",
      "Discard",
      true,
      "Keep recording",
    );
    if (!confirmed) return;

    await cleanupAudio();
    const uri = recordedUriRef.current ?? recorderRef.current.uri;
    if (uri) deleteLocalFile(uri);
    const cachedUri = processedCacheRef.current?.uri;
    if (cachedUri && cachedUri !== uri) deleteLocalFile(cachedUri);
    processedCacheRef.current = null;
    dismiss();
  }, [cleanupAudio, dismiss, showConfirm]);

  const handleSeekChange = useCallback((seconds: number) => {
    setScrubPosition(seconds);
  }, []);

  const handleSeekComplete = useCallback(
    (seconds: number) => {
      const bounded = clamp(seconds, startSeconds, endSeconds);
      didHandlePlaybackEndRef.current = false;
      setScrubPosition(bounded);
      setPlaybackPositionSeconds(bounded);
      setIsScrubbing(false);
      void playerRef.current.seekTo(bounded);
    },
    [endSeconds, startSeconds],
  );

  const handleRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    try {
      playerRef.current.setPlaybackRate(rate);
    } catch (error) {
      console.warn("Playback speed change error:", error);
    }
  }, []);

  const handleVolumeChange = useCallback((nextVolume: number) => {
    const bounded = clamp(nextVolume, 0, 1);
    setVolume(bounded);
    try {
      playerRef.current.volume = bounded;
    } catch (error) {
      console.warn("Playback volume change error:", error);
    }
  }, []);

  const handleResetTrim = useCallback(() => {
    playerRef.current.pause();
    trimStartRatioRef.current = 0;
    trimEndRatioRef.current = 1;
    setTrimStartRatio(0);
    setTrimEndRatio(1);
    invalidateProcessedCache();
    didHandlePlaybackEndRef.current = false;
    setPlaybackPositionSeconds(0);
    setScrubPosition(0);
    void playerRef.current.seekTo(0);
  }, [invalidateProcessedCache]);

  const toggleVoiceCleanup = useCallback(() => {
    setVoiceCleanupEnabled((enabled) => !enabled);
    invalidateProcessedCache();
  }, [invalidateProcessedCache]);

  const innerRingScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const innerRingOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.85, 0.35],
  });
  const middleRingScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });
  const middleRingOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 0.55, 0.15],
  });
  const outerRingScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.48],
  });
  const outerRingOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.7, 0.35, 0],
  });
  const centerMicScale = rippleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.04, 1],
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {dialog}
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarContent}>
            <TouchableOpacity onPress={handleCancel} hitSlop={12} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {isReviewMode
                ? "Preview & Save"
                : recordState === "paused"
                  ? "Recording Paused"
                  : "Recording"}
            </Text>
            <View style={styles.topBarSpacer} />
          </View>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageConstraint}>
            {!isReviewMode ? (
              <View style={styles.liveRecordContainer}>
                <View style={styles.micStage}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handlePauseResume}
                    style={styles.micTouchable}
                  >
                    <Animated.View
                      style={[
                        styles.pulseRingOuter,
                        {
                          transform: [{ scale: outerRingScale }],
                          opacity: outerRingOpacity,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.pulseRingMiddle,
                        {
                          transform: [{ scale: middleRingScale }],
                          opacity: middleRingOpacity,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.pulseRingInner,
                        {
                          transform: [{ scale: innerRingScale }],
                          opacity: innerRingOpacity,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[styles.micCircle, { transform: [{ scale: centerMicScale }] }]}
                    >
                      <Ionicons
                        name={recordState === "paused" ? "mic-off" : "mic"}
                        size={responsive.isShort ? 36 : 44}
                        color={colors.primary}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                </View>

                <Text style={styles.timerDisplay}>{formatTime(durationMillis)}</Text>

                <View style={styles.waveformWrapper}>
                  <View style={styles.waveformContainer}>
                    {waveformBars.map((height, index) => (
                      <View
                        key={index}
                        style={[
                          styles.waveBar,
                          {
                            height: Math.max(5, height),
                            opacity: recordState === "paused" ? 0.42 : 1,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.tapPrompt}>
                    {recordState === "paused"
                      ? "Recording paused · tap the microphone to resume"
                      : "Recording · tap the microphone to pause"}
                  </Text>
                </View>

                <View style={styles.recordActionsRow}>
                  <View style={styles.actionCol}>
                    <TouchableOpacity
                      style={styles.actionCircleButton}
                      onPress={handlePauseResume}
                    >
                      <Ionicons
                        name={recordState === "paused" ? "play" : "pause"}
                        size={22}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>
                      {recordState === "paused" ? "Resume" : "Pause"}
                    </Text>
                  </View>

                  <View style={styles.actionCol}>
                    <TouchableOpacity
                      style={[styles.actionCircleButton, styles.finishButtonAccent]}
                      onPress={() => void handleFinish()}
                      disabled={recordState === "idle" || isStoppingRef.current}
                    >
                      <MaterialCommunityIcons name="square" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>Finish</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={[styles.reviewContainer, isWide && styles.reviewWideLayout]}>
                <View style={isWide ? styles.reviewLeftColumn : styles.reviewFullColumn}>
                  <View style={styles.playerPreviewCard}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => void handleTogglePlayback()}
                      style={styles.previewPlayTouchable}
                    >
                      <View style={styles.micCircleReview}>
                        <Ionicons
                          name={playerStatus.playing ? "pause" : "play"}
                          size={responsive.isShort ? 30 : 36}
                          color={colors.primary}
                          style={playerStatus.playing ? undefined : styles.playIconNudge}
                        />
                      </View>
                    </TouchableOpacity>

                    <Text style={styles.timerDisplayReview}>
                      {formatTime(displayedPlaybackMillis)}
                    </Text>
                    <Text style={styles.totalTimeText}>
                      Selected: {formatTime(selectedDurationMillis)} · Total:{" "}
                      {formatTime(durationMillis)}
                    </Text>
                  </View>

                  <View style={styles.trimmerCard}>
                    <View style={styles.sectionHeadingRow}>
                      <Text style={styles.sectionTitle}>Trim audio</Text>
                      <TouchableOpacity onPress={handleResetTrim} hitSlop={8}>
                        <Text style={styles.resetText}>Reset</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.trimInstruction}>
                      Drag either handle to trim. The original take remains preserved.
                    </Text>

                    <View
                      style={styles.trimmerBox}
                      onLayout={(e) => {
                        trimmerWidthRef.current = e.nativeEvent.layout.width;
                      }}
                    >
                      <View style={styles.waveformBarsStatic}>
                        {waveformBars.map((height, index) => (
                          <View
                            key={index}
                            style={[
                              styles.waveBarTrimmer,
                              { height: Math.max(height * 0.85, 7) },
                            ]}
                          />
                        ))}
                      </View>
                      <View
                        pointerEvents="none"
                        style={[
                          styles.trimMask,
                          { left: 0, width: `${trimStartRatio * 100}%` },
                        ]}
                      />
                      <View
                        pointerEvents="none"
                        style={[
                          styles.trimMask,
                          { right: 0, width: `${(1 - trimEndRatio) * 100}%` },
                        ]}
                      />
                      <View
                        {...leftPanResponder.panHandlers}
                        style={[
                          styles.trimHandle,
                          {
                            left: `${trimStartRatio * 100}%`,
                            transform: [{ translateX: -TRIM_HANDLE_WIDTH / 2 }],
                          },
                        ]}
                        accessibilityRole="adjustable"
                        accessibilityLabel="Trim start handle"
                      >
                        <View style={styles.handleBar} />
                      </View>
                      <View
                        {...rightPanResponder.panHandlers}
                        style={[
                          styles.trimHandle,
                          {
                            left: `${trimEndRatio * 100}%`,
                            transform: [{ translateX: -TRIM_HANDLE_WIDTH / 2 }],
                          },
                        ]}
                        accessibilityRole="adjustable"
                        accessibilityLabel="Trim end handle"
                      >
                        <View style={styles.handleBar} />
                      </View>
                    </View>

                    <View style={styles.trimTimesRow}>
                      <View>
                        <Text style={styles.trimTimeLabel}>START</Text>
                        <Text style={styles.trimTimeText}>{formatTime(startMillis)}</Text>
                      </View>
                      <View style={styles.trimEndTime}>
                        <Text style={styles.trimTimeLabel}>END</Text>
                        <Text style={styles.trimTimeText}>{formatTime(endMillis)}</Text>
                      </View>
                    </View>

                    <Slider
                      style={styles.slider}
                      minimumValue={startSeconds}
                      maximumValue={Math.max(endSeconds, startSeconds + 0.01)}
                      value={clamp(
                        scrubPosition,
                        startSeconds,
                        Math.max(endSeconds, startSeconds + 0.01),
                      )}
                      onSlidingStart={() => setIsScrubbing(true)}
                      onValueChange={handleSeekChange}
                      onSlidingComplete={handleSeekComplete}
                      minimumTrackTintColor={colors.primary}
                      maximumTrackTintColor={colors.border}
                      thumbTintColor={colors.primary}
                      disabled={!playerStatus.isLoaded || durationMillis <= 0}
                    />

                    <View style={styles.controlRow}>
                      <Text style={styles.controlLabel}>Speed</Text>
                      <View style={styles.rateOptions}>
                        {[0.75, 1, 1.25, 1.5].map((rate) => (
                          <TouchableOpacity
                            key={rate}
                            onPress={() => handleRateChange(rate)}
                            style={[
                              styles.rateButton,
                              playbackRate === rate && styles.rateButtonActive,
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: playbackRate === rate }}
                          >
                            <Text
                              style={[
                                styles.rateButtonText,
                                playbackRate === rate && styles.rateButtonTextActive,
                              ]}
                            >
                              {rate}×
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.volumeRow}>
                      <Ionicons
                        name="volume-low-outline"
                        size={17}
                        color={colors.textSecondary}
                      />
                      <Slider
                        style={styles.volumeSlider}
                        minimumValue={0}
                        maximumValue={1}
                        value={volume}
                        onValueChange={handleVolumeChange}
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor={colors.border}
                        thumbTintColor={colors.primary}
                      />
                      <Ionicons
                        name="volume-high-outline"
                        size={17}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.volumeValue}>{Math.round(volume * 100)}%</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.cleanupRow}
                      onPress={toggleVoiceCleanup}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: voiceCleanupEnabled }}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          voiceCleanupEnabled && styles.checkboxChecked,
                        ]}
                      >
                        {voiceCleanupEnabled ? (
                          <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                        ) : null}
                      </View>
                      <View style={styles.cleanupCopy}>
                        <Text style={styles.cleanupTitle}>Voice cleanup</Text>
                        <Text style={styles.cleanupDescription}>
                          Normalize volume and reduce background noise on save.
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="tune-variant"
                        size={20}
                        color={colors.tealStrong}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={isWide ? styles.reviewRightColumn : styles.reviewFullColumn}>
                  <View style={styles.metadataCard}>
                    <View style={styles.nameHeaderRow}>
                      <Ionicons name="create-outline" size={16} color={colors.tealStrong} />
                      <Text style={styles.sectionTitle}>Recording Name</Text>
                    </View>
                    <View style={styles.nameInputContainer}>
                      <TextInput
                        value={recordingTitle}
                        onChangeText={setRecordingTitle}
                        placeholder="Name this voice moment..."
                        placeholderTextColor={colors.textTertiary}
                        style={styles.nameInput}
                        maxLength={80}
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                      {recordingTitle.length > 0 ? (
                        <TouchableOpacity
                          onPress={() => setRecordingTitle("")}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Clear recording name"
                        >
                          <Ionicons
                            name="close-circle"
                            size={18}
                            color={colors.textTertiary}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <View style={styles.tagsDivider} />

                    <TagSelector
                      selectedTags={selectedTags}
                      onChangeSelectedTags={setSelectedTags}
                    />
                  </View>

                  <View style={styles.actionsCard}>
                    <View style={styles.reviewActionsRow}>
                      <TouchableOpacity
                        style={styles.reRecordButton}
                        onPress={async () => {
                          const confirmed = await showConfirm(
                            "Record again?",
                            "The current unsaved take will be replaced.",
                            "Retake",
                            true,
                          );
                          if (confirmed) void startRecording();
                        }}
                        disabled={isProcessing}
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={18}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.reRecordButtonText}>Retake</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.exportButton}
                        onPress={() => void handleExport()}
                        disabled={isProcessing}
                      >
                        <Ionicons name="share-outline" size={18} color={colors.primary} />
                        <Text style={styles.exportButtonText}>Export</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.saveTrimButton,
                        isProcessing && styles.disabledButton,
                      ]}
                      onPress={() => void handleSaveRecording()}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Text style={styles.saveTrimButtonText}>{processingLabel}</Text>
                      ) : (
                        <>
                          <Ionicons
                            name="save-outline"
                            size={19}
                            color={colors.textInverse}
                          />
                          <Text style={styles.saveTrimButtonText}>Save Recording</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: Theme,
  isDark: boolean,
  responsive: ReturnType<typeof useResponsiveLayout>,
  isWide: boolean,
) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const floatingShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;
  const waveSage = isDark ? colors.teal : "#5C8A71";

  const stageSize = responsive.isShort ? 180 : responsive.isTablet ? 250 : 210;
  const micCircleSize = responsive.isShort ? 88 : responsive.isTablet ? 116 : 104;
  const outerRingSize = stageSize;
  const middleRingSize = stageSize * 0.81;
  const innerRingSize = stageSize * 0.65;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardWrap: {
      flex: 1,
    },
    topBar: {
      minHeight: Layout.controlHeight,
      paddingHorizontal: responsive.horizontalPadding,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      justifyContent: "center",
    },
    topBarContent: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cancelText: {
      ...Typography.bodyMedium,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      color: colors.tealStrong,
    },
    headerTitle: {
      ...Typography.headline,
      fontFamily: Fonts?.sans,
      fontSize: responsive.isCompact ? 16 : 18,
      fontWeight: "700",
      color: colors.primary,
    },
    topBarSpacer: { width: 50 },
    scrollArea: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: responsive.isShort ? Spacing.two : Spacing.three,
      paddingBottom: responsive.isShort ? Spacing.four : Spacing.six,
    },
    pageConstraint: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },

    liveRecordContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: responsive.isShort ? Spacing.two : Spacing.four,
    },
    micStage: {
      width: stageSize,
      height: stageSize,
      alignItems: "center",
      justifyContent: "center",
    },
    micTouchable: {
      width: stageSize,
      height: stageSize,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    pulseRingOuter: {
      position: "absolute",
      width: outerRingSize,
      height: outerRingSize,
      borderRadius: Radius.pill,
      backgroundColor: isDark ? "rgba(247, 201, 72, 0.08)" : "rgba(247, 201, 72, 0.16)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(247, 201, 72, 0.14)" : "rgba(247, 201, 72, 0.28)",
    },
    pulseRingMiddle: {
      position: "absolute",
      width: middleRingSize,
      height: middleRingSize,
      borderRadius: Radius.pill,
      backgroundColor: isDark ? "rgba(247, 201, 72, 0.14)" : "rgba(247, 201, 72, 0.28)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(247, 201, 72, 0.22)" : "rgba(247, 201, 72, 0.42)",
    },
    pulseRingInner: {
      position: "absolute",
      width: innerRingSize,
      height: innerRingSize,
      borderRadius: Radius.pill,
      backgroundColor: isDark ? "rgba(247, 201, 72, 0.22)" : "rgba(247, 201, 72, 0.46)",
      borderWidth: 1.5,
      borderColor: isDark ? "rgba(247, 201, 72, 0.32)" : "rgba(247, 201, 72, 0.58)",
    },
    micCircle: {
      width: micCircleSize,
      height: micCircleSize,
      borderRadius: Radius.pill,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      ...floatingShadow,
    },
    timerDisplay: {
      ...Typography.displayXL,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 32 : responsive.isShort ? 34 : 40,
      lineHeight: responsive.isCompact ? 38 : responsive.isShort ? 40 : 46,
      fontWeight: "700",
      color: colors.primary,
      marginTop: Spacing.two,
      fontVariant: ["tabular-nums"],
    },
    waveformWrapper: {
      width: "100%",
      alignItems: "center",
      paddingTop: responsive.isShort ? Spacing.two : Spacing.four,
      paddingBottom: responsive.isShort ? Spacing.three : Spacing.five,
    },
    waveformContainer: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: responsive.isShort ? 46 : 58,
      gap: responsive.isCompact ? 2.5 : 3.5,
    },
    waveBar: {
      width: 3.5,
      borderRadius: Radius.pill,
      backgroundColor: waveSage,
    },
    tapPrompt: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
      color: colors.textSecondary,
      marginTop: Spacing.three,
    },
    recordActionsRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: responsive.isCompact ? Spacing.six : Spacing.eight,
      marginTop: responsive.isShort ? Spacing.three : Spacing.five,
    },
    actionCol: { alignItems: "center", gap: Spacing.one },
    actionCircleButton: {
      width: responsive.isShort ? 58 : 64,
      height: responsive.isShort ? 58 : 64,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    finishButtonAccent: {
      backgroundColor: colors.surfaceSage,
      borderColor: colors.border,
    },
    actionLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "600",
      color: colors.textPrimary,
    },

    reviewContainer: {
      width: "100%",
      gap: Spacing.four,
    },
    reviewWideLayout: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    reviewLeftColumn: {
      flex: 1.1,
      minWidth: 0,
      gap: Spacing.four,
    },
    reviewRightColumn: {
      flex: 0.9,
      minWidth: 0,
      gap: Spacing.four,
    },
    reviewFullColumn: {
      width: "100%",
      gap: Spacing.four,
    },

    playerPreviewCard: {
      width: "100%",
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      ...cardShadow,
    },
    previewPlayTouchable: {
      alignItems: "center",
      justifyContent: "center",
      marginVertical: Spacing.one,
    },
    micCircleReview: {
      width: responsive.isShort ? 72 : 84,
      height: responsive.isShort ? 72 : 84,
      borderRadius: Radius.pill,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      ...floatingShadow,
    },
    playIconNudge: { marginLeft: 3 },
    timerDisplayReview: {
      ...Typography.display,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 28 : 34,
      lineHeight: responsive.isCompact ? 34 : 40,
      fontWeight: "700",
      color: colors.primary,
      marginTop: Spacing.two,
      fontVariant: ["tabular-nums"],
    },
    totalTimeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      color: colors.textSecondary,
      marginTop: 2,
    },

    trimmerCard: {
      width: "100%",
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    sectionHeadingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.one,
    },
    sectionTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    resetText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    trimInstruction: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      fontWeight: "500",
      color: colors.textSecondary,
      marginBottom: Spacing.three,
    },
    trimmerBox: {
      width: "100%",
      height: 68,
      borderRadius: Radius.md,
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      overflow: "hidden",
      position: "relative",
      justifyContent: "center",
    },
    waveformBarsStatic: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 6,
      height: "100%",
    },
    waveBarTrimmer: {
      width: 3.5,
      borderRadius: Radius.pill,
      backgroundColor: waveSage,
    },
    trimMask: {
      position: "absolute",
      top: 0,
      bottom: 0,
      backgroundColor: isDark ? "rgba(15, 26, 51, 0.76)" : "rgba(21, 54, 94, 0.3)",
    },
    trimHandle: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: TRIM_HANDLE_WIDTH,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    },
    handleBar: {
      width: 3.5,
      height: 24,
      borderRadius: 2,
      backgroundColor: colors.textInverse,
    },
    trimTimesRow: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: Spacing.two,
      marginBottom: Spacing.two,
    },
    trimEndTime: { alignItems: "flex-end" },
    trimTimeLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 9,
      letterSpacing: 1,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    trimTimeText: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 11,
      fontWeight: "600",
      color: colors.textPrimary,
      marginTop: 2,
    },
    slider: {
      width: "100%",
      height: 32,
      marginVertical: Spacing.one,
    },
    controlRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: Spacing.one,
    },
    controlLabel: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    rateOptions: { flexDirection: "row", gap: 5 },
    rateButton: {
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.background,
    },
    rateButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    rateButtonText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rateButtonTextActive: { color: colors.textInverse },
    volumeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: Spacing.two,
    },
    volumeSlider: { flex: 1, height: 32 },
    volumeValue: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 10,
      width: 32,
      textAlign: "right",
      color: colors.textSecondary,
    },
    cleanupRow: {
      width: "100%",
      borderRadius: Radius.lg,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.three,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      marginTop: Spacing.three,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cleanupCopy: { flex: 1 },
    cleanupTitle: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    cleanupDescription: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
      color: colors.textSecondary,
    },

    metadataCard: {
      width: "100%",
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    nameHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: Spacing.two,
    },
    nameInputContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.background,
      paddingHorizontal: Spacing.three,
    },
    nameInput: {
      flex: 1,
      minHeight: 44,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    tagsDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Spacing.four,
    },

    actionsCard: {
      width: "100%",
      gap: Spacing.three,
    },
    reviewActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      width: "100%",
    },
    reRecordButton: {
      flex: 1,
      height: Layout.controlHeight,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    reRecordButtonText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    exportButton: {
      flex: 1,
      height: Layout.controlHeight,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    exportButtonText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontWeight: "700",
      color: colors.primary,
    },
    saveTrimButton: {
      width: "100%",
      height: Layout.controlHeightLarge,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      ...floatingShadow,
    },
    disabledButton: { opacity: 0.65 },
    saveTrimButtonText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontWeight: "800",
      fontSize: 15,
      color: colors.textInverse,
    },
  });
}