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
import {
    extractHttpsUrl,
    importDirectAudioUrl,
    saveAudioImport,
} from "@/lib/audio/import-recording";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Easing,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export type ImportAudioCardProps = {
  onImportComplete?: () => void;
  style?: StyleProp<ViewStyle>;
};

type PickedAudioFile = {
  uri: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
};

const PREVIEW_BARS = [
  14, 24, 34, 20, 42, 30, 48, 26, 36, 18, 40, 46, 22, 32, 28, 44, 20, 36, 26,
  16, 30, 38, 24, 18,
];

const OVERLAY_WAVE_HEIGHTS = [14, 26, 40, 52, 42, 28, 16, 34, 46, 24, 14];

const IMPORT_STEPS = [
  {
    title: "Reading audio stream",
    subtitle: "Inspecting file container and audio channels...",
  },
  {
    title: "Processing waveform",
    subtitle: "Preparing high-clarity playback for your library...",
  },
  {
    title: "Saving to VoiceNest",
    subtitle: "Securing your voice moment with your title and tags...",
  },
];

function stripFileExtension(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "Audio file";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ImportAudioCard({ onImportComplete, style }: ImportAudioCardProps) {
  const colors = useAppTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, isDark, responsive),
    [colors, isDark, responsive],
  );

  const { addRecording, pausePlayback } = useRecordings();
  const { dialog, showAlert } = useAppDialog();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"file" | "url">("file");
  const [pickedFile, setPickedFile] = useState<PickedAudioFile | null>(null);
  const [directUrlInput, setDirectUrlInput] = useState("");
  const [recordingTitle, setRecordingTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(["Motivation"]);

  const [isImporting, setIsImporting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [boostCount, setBoostCount] = useState(0);

  const previewPlayer = useAudioPlayer(null, { updateInterval: 100 });
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  const waveValues = useMemo(
    () => OVERLAY_WAVE_HEIGHTS.map(() => new Animated.Value(0.35)),
    [],
  );
  const ringAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const orbBounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isImporting) {
      progressAnim.setValue(0);
      ringAnim.setValue(0);
      setStepIndex(0);
      setBoostCount(0);
      return;
    }

    Animated.timing(progressAnim, {
      toValue: 0.92,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    ringLoop.start();

    const waveLoops = waveValues.map((anim, index) => {
      const cycleDuration = 320 + (index % 4) * 90;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: cycleDuration,
            delay: index * 45,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.28,
            duration: cycleDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return loop;
    });

    const stepInterval = setInterval(() => {
      setStepIndex((prev) => (prev < IMPORT_STEPS.length - 1 ? prev + 1 : prev));
    }, 620);

    return () => {
      ringLoop.stop();
      waveLoops.forEach((loop) => loop.stop());
      clearInterval(stepInterval);
    };
  }, [isImporting, progressAnim, ringAnim, waveValues]);

  function stopPreview() {
    try {
      previewPlayer.pause();
    } catch {
      // Ignore if not loaded
    }
  }

  function openImportScreen() {
    pausePlayback();
    setPickedFile(null);
    setDirectUrlInput("");
    setRecordingTitle("");
    setSelectedTags(["Motivation"]);
    setSourceMode("file");
    setIsModalOpen(true);
  }

  function closeImportScreen() {
    if (isImporting) return;
    stopPreview();
    setIsModalOpen(false);
  }

  async function handlePickFile() {
    try {
      stopPreview();
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "audio/*",
          "audio/mpeg",
          "audio/mp4",
          "audio/x-m4a",
          "audio/wav",
          "audio/aac",
          "audio/ogg",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const nextFile: PickedAudioFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        sizeBytes: asset.size ?? undefined,
      };

      setPickedFile(nextFile);
      if (!recordingTitle.trim()) {
        setRecordingTitle(stripFileExtension(asset.name) || "Imported Audio");
      }

      try {
        previewPlayer.replace(asset.uri);
      } catch {
        // Preview is optional if format requires native decoding after import
      }
    } catch (error) {
      void showAlert(
        "Could not select file",
        error instanceof Error ? error.message : "Please try choosing another audio file.",
      );
    }
  }

  function handleTogglePreview() {
    if (!pickedFile) return;
    try {
      if (previewStatus.playing) {
        previewPlayer.pause();
      } else {
        previewPlayer.play();
      }
    } catch {
      // Ignore preview playback errors
    }
  }

  function handleInteractivePulse() {
    setBoostCount((prev) => prev + 1);
    setStepIndex((prev) => (prev + 1) % IMPORT_STEPS.length);
    orbBounceAnim.setValue(0.88);
    Animated.spring(orbBounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }

  async function handleConfirmImport() {
    if (isImporting) return;

    const cleanTitle = recordingTitle.trim() || (
      pickedFile ? stripFileExtension(pickedFile.name) : "Imported Audio"
    );
    const primaryCategory = selectedTags[0] || "Motivation";

    stopPreview();
    setIsImporting(true);
    const startedAt = Date.now();

    try {
      const customAddRecording = async (input: any) => {
        return addRecording({
          ...input,
          title: cleanTitle,
          category: primaryCategory,
          tags: selectedTags.length > 0 ? selectedTags : [primaryCategory],
        });
      };

      if (sourceMode === "file") {
        if (!pickedFile) {
          setIsImporting(false);
          void showAlert("No file selected", "Choose an audio file from your device first.");
          return;
        }

        const durationMillis =
          previewStatus.isLoaded && previewStatus.duration > 0
            ? Math.round(previewStatus.duration * 1000)
            : undefined;

        await saveAudioImport(
          {
            uri: pickedFile.uri,
            name: cleanTitle,
            mimeType: pickedFile.mimeType,
            sizeBytes: pickedFile.sizeBytes,
            durationMillis,
          },
          customAddRecording,
        );
      } else {
        const extractedUrl = extractHttpsUrl(directUrlInput) || directUrlInput.trim();
        if (!extractedUrl) {
          setIsImporting(false);
          void showAlert("Enter a link", "Paste a direct HTTPS link to an audio file.");
          return;
        }
        await importDirectAudioUrl(extractedUrl, customAddRecording);
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < 1100) {
        await delay(1100 - elapsed);
      }

      await new Promise<void>((resolve) => {
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start(() => resolve());
      });

      setIsImporting(false);
      setIsModalOpen(false);
      onImportComplete?.();

      void showAlert(
        "Audio imported",
        `"${cleanTitle}" was added to your VoiceNest library${
          selectedTags.length ? ` under ${selectedTags.join(", ")}` : ""
        }.`,
      );
    } catch (error) {
      setIsImporting(false);
      void showAlert(
        "Import failed",
        error instanceof Error
          ? error.message
          : "Could not import the selected audio.",
      );
    }
  }

  const canSubmit =
    sourceMode === "file"
      ? Boolean(pickedFile)
      : Boolean(directUrlInput.trim());

  const ringScale = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.55],
  });
  const ringOpacity = ringAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.55, 0.25, 0],
  });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["10%", "100%"],
  });

  const activeStep = IMPORT_STEPS[stepIndex] ?? IMPORT_STEPS[0];
  const previewProgress =
    previewStatus.duration > 0
      ? Math.min(1, previewStatus.currentTime / previewStatus.duration)
      : 0;

  return (
    <>
      <TouchableOpacity
        style={[styles.quickCard, { backgroundColor: colors.surfaceSage }, style]}
        onPress={openImportScreen}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Import audio"
      >
        <View style={[styles.quickIcon, { backgroundColor: colors.backgroundElevated }]}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.quickText}>
          <Text style={styles.quickTitle} numberOfLines={1}>
            Import audio
          </Text>
          <Text style={styles.quickCaption} numberOfLines={1}>
            Keep it all close
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={isModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeImportScreen}
        statusBarTranslucent={Platform.OS === "android"}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
          translucent={Platform.OS === "android"}
        />
        <SafeAreaView
          style={[
            styles.modalScreen,
            Platform.OS === "android" && { paddingTop: Math.max(insets.top, Spacing.two) },
          ]}
          edges={["top", "left", "right"]}
        >
          <KeyboardAvoidingView
            style={styles.flexFill}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.topBar}>
              <View style={styles.topBarInner}>
                <TouchableOpacity
                  onPress={closeImportScreen}
                  hitSlop={12}
                  style={styles.topIconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel import"
                >
                  <Ionicons name="close" size={21} color={colors.textPrimary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                  <Text style={styles.headerTitle}>Import Audio</Text>
                  <Text style={styles.headerSubtitle}>
                    Add an existing voice note or audio clip
                  </Text>
                </View>

                <View style={styles.topBarSpacer} />
              </View>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pageWidth}>
                <View style={styles.modeSwitchRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      sourceMode === "file" && styles.modeTabActive,
                    ]}
                    onPress={() => setSourceMode("file")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="folder-open-outline"
                      size={16}
                      color={sourceMode === "file" ? colors.textInverse : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeTabText,
                        sourceMode === "file" && styles.modeTabTextActive,
                      ]}
                    >
                      Device File
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      sourceMode === "url" && styles.modeTabActive,
                    ]}
                    onPress={() => {
                      stopPreview();
                      setSourceMode("url");
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="link-outline"
                      size={16}
                      color={sourceMode === "url" ? colors.textInverse : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeTabText,
                        sourceMode === "url" && styles.modeTabTextActive,
                      ]}
                    >
                      Direct URL
                    </Text>
                  </TouchableOpacity>
                </View>

                {sourceMode === "file" ? (
                  !pickedFile ? (
                    <TouchableOpacity
                      style={styles.dropzoneCard}
                      onPress={() => void handlePickFile()}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Choose audio file from device"
                    >
                      <View style={styles.dropzoneOrb}>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={34}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={styles.dropzoneTitle}>
                        Tap to choose an audio file
                      </Text>
                      <Text style={styles.dropzoneSubtitle}>
                        Import voice memos, music, or affirmations directly from your device storage.
                      </Text>
                      <View style={styles.formatPillRow}>
                        {["MP3", "WAV", "M4A", "AAC", "OGG"].map((ext) => (
                          <View key={ext} style={styles.formatBadge}>
                            <Text style={styles.formatBadgeText}>{ext}</Text>
                          </View>
                        ))}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.selectedFileCard}>
                      <View style={styles.selectedFileTopRow}>
                        <View style={styles.fileIconBox}>
                          <Ionicons
                            name="musical-notes"
                            size={22}
                            color={colors.primary}
                          />
                        </View>
                        <View style={styles.flexFill}>
                          <Text style={styles.selectedFileName} numberOfLines={1}>
                            {pickedFile.name}
                          </Text>
                          <Text style={styles.selectedFileMeta}>
                            {formatBytes(pickedFile.sizeBytes)}
                            {previewStatus.duration > 0
                              ? ` · ${formatSeconds(previewStatus.duration)}`
                              : ""}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.changeFileChip}
                          onPress={() => void handlePickFile()}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="swap-horizontal-outline"
                            size={14}
                            color={colors.tealStrong}
                          />
                          <Text style={styles.changeFileText}>Replace</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.previewPlayerRow}>
                        <TouchableOpacity
                          style={styles.previewPlayButton}
                          onPress={handleTogglePreview}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={
                            previewStatus.playing ? "Pause preview" : "Play preview"
                          }
                        >
                          <Ionicons
                            name={previewStatus.playing ? "pause" : "play"}
                            size={18}
                            color={colors.textInverse}
                          />
                        </TouchableOpacity>

                        <View style={styles.previewWaveform}>
                          {PREVIEW_BARS.map((barHeight, idx) => {
                            const active =
                              idx / PREVIEW_BARS.length <= previewProgress;
                            return (
                              <View
                                key={idx}
                                style={[
                                  styles.previewWaveBar,
                                  {
                                    height: barHeight,
                                    opacity: active ? 1 : 0.38,
                                    backgroundColor: active
                                      ? colors.tealStrong
                                      : colors.primary,
                                  },
                                ]}
                              />
                            );
                          })}
                        </View>

                        <Text style={styles.previewTimeText}>
                          {formatSeconds(previewStatus.currentTime)}
                        </Text>
                      </View>
                    </View>
                  )
                ) : (
                  <View style={styles.urlCard}>
                    <View style={styles.urlHeaderRow}>
                      <View style={styles.fileIconBox}>
                        <Ionicons name="globe-outline" size={22} color={colors.primary} />
                      </View>
                      <View style={styles.flexFill}>
                        <Text style={styles.selectedFileName}>
                          Direct Audio Link
                        </Text>
                        <Text style={styles.selectedFileMeta}>
                          Paste a direct HTTPS URL ending in .mp3, .wav, .m4a, or .ogg
                        </Text>
                      </View>
                    </View>

                    <TextInput
                      value={directUrlInput}
                      onChangeText={(text) => {
                        setDirectUrlInput(text);
                        if (!recordingTitle.trim() && text.includes("/")) {
                          const tail = text.split("?")[0].split("/").pop();
                          if (tail) {
                            setRecordingTitle(stripFileExtension(tail));
                          }
                        }
                      }}
                      placeholder="https://example.com/voice-moment.mp3"
                      placeholderTextColor={colors.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={styles.urlInput}
                    />
                  </View>
                )}

                <View style={styles.formSection}>
                  <View style={styles.fieldHeaderRow}>
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={colors.tealStrong}
                    />
                    <Text style={styles.fieldLabel}>Recording Name</Text>
                  </View>
                  <View style={styles.titleInputWrap}>
                    <TextInput
                      value={recordingTitle}
                      onChangeText={setRecordingTitle}
                      placeholder="Give this voice moment a title..."
                      placeholderTextColor={colors.textTertiary}
                      style={styles.titleInput}
                      maxLength={80}
                      returnKeyType="done"
                    />
                    {recordingTitle.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => setRecordingTitle("")}
                        hitSlop={8}
                        style={styles.clearInputBtn}
                      >
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color={colors.textTertiary}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                <View style={styles.formSection}>
                  <TagSelector
                    selectedTags={selectedTags}
                    onChangeSelectedTags={setSelectedTags}
                  />
                </View>
              </View>
            </ScrollView>

            <View
              style={[
                styles.footerBar,
                { paddingBottom: Math.max(insets.bottom, Spacing.three) },
              ]}
            >
              <View style={styles.footerInner}>
                <TouchableOpacity
                  style={styles.cancelFooterBtn}
                  onPress={closeImportScreen}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelFooterText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveFooterBtn,
                    !canSubmit && styles.saveFooterBtnDisabled,
                  ]}
                  onPress={() => void handleConfirmImport()}
                  disabled={!canSubmit || isImporting}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="cloud-done-outline"
                    size={19}
                    color={colors.textInverse}
                  />
                  <Text style={styles.saveFooterText}>Save to Library</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>

          {isImporting ? (
            <View style={styles.overlayBackdrop}>
              <View style={styles.overlayCard}>
                <View style={styles.topPillRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>
                      {sourceMode === "url" ? "CLOUD STREAM" : "LOCAL IMPORT"}
                    </Text>
                  </View>
                  <Text style={styles.stepCounterText}>
                    Step {stepIndex + 1} of {IMPORT_STEPS.length}
                  </Text>
                </View>

                <Pressable
                  onPress={handleInteractivePulse}
                  style={styles.orbStage}
                  accessibilityRole="button"
                  accessibilityLabel="Tap to pulse waveform"
                >
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [{ scale: ringScale }],
                        opacity: ringOpacity,
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.waveformOrb,
                      { transform: [{ scale: orbBounceAnim }] },
                    ]}
                  >
                    <View style={styles.waveformRow}>
                      {OVERLAY_WAVE_HEIGHTS.map((h, index) => (
                        <Animated.View
                          key={index}
                          style={[
                            styles.waveBar,
                            {
                              height: h,
                              transform: [{ scaleY: waveValues[index] }],
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </Animated.View>
                </Pressable>

                <Text style={styles.overlayTitle}>{activeStep.title}</Text>
                <Text style={styles.overlaySubtitle}>{activeStep.subtitle}</Text>

                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[styles.progressFill, { width: progressWidth }]}
                  />
                </View>

                <Text style={styles.interactiveHint}>
                  {boostCount > 0
                    ? `Waveform synced · ${boostCount}x resonance`
                    : "Tap the waveform orb while we prep your audio"}
                </Text>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      {dialog}
    </>
  );
}

function createStyles(
  colors: Theme,
  isDark: boolean,
  responsive: ReturnType<typeof useResponsiveLayout>,
) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const floatingShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;

  return StyleSheet.create({
    flexFill: { flex: 1, minWidth: 0 },
    quickCard: {
      width: responsive.width < 360 ? "100%" : "48.5%",
      minHeight: responsive.isShort ? 72 : 84,
      paddingHorizontal: responsive.isCompact ? Spacing.two : Spacing.three,
      paddingVertical: Spacing.three,
      borderRadius: Radius.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    quickIcon: {
      width: 38,
      height: 38,
      borderRadius: Radius.sm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickText: { flex: 1, minWidth: 0, justifyContent: "center" },
    quickTitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontWeight: "700",
      fontSize: responsive.isCompact ? 11 : 12,
      lineHeight: 16,
      color: colors.textPrimary,
    },
    quickCaption: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 2,
      color: colors.textSecondary,
    },

    modalScreen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingVertical: Spacing.two,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    topBarInner: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topIconBtn: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    topBarSpacer: {
      width: Layout.iconButton,
      height: Layout.iconButton,
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: Spacing.two,
    },
    headerTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 20,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    scrollArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.four,
      paddingBottom: Spacing.eight,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    modeSwitchRow: {
      flexDirection: "row",
      gap: Spacing.two,
      padding: Spacing.one,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.four,
    },
    modeTab: {
      flex: 1,
      minHeight: 42,
      borderRadius: Radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
    },
    modeTabActive: {
      backgroundColor: colors.primary,
    },
    modeTabText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    modeTabTextActive: {
      color: colors.textInverse,
    },
    dropzoneCard: {
      width: "100%",
      borderRadius: Radius.xl,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      backgroundColor: colors.backgroundElevated,
      paddingHorizontal: Spacing.five,
      paddingVertical: Spacing.six,
      alignItems: "center",
      ...cardShadow,
    },
    dropzoneOrb: {
      width: 68,
      height: 68,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.three,
    },
    dropzoneTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 19,
      color: colors.textPrimary,
      textAlign: "center",
    },
    dropzoneSubtitle: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: Spacing.one,
      maxWidth: 320,
    },
    formatPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: Spacing.two,
      marginTop: Spacing.four,
    },
    formatBadge: {
      paddingHorizontal: Spacing.two + 2,
      paddingVertical: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    formatBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 10,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    selectedFileCard: {
      width: "100%",
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.four,
      gap: Spacing.four,
      ...cardShadow,
    },
    selectedFileTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    fileIconBox: {
      width: 46,
      height: 46,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    selectedFileName: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    selectedFileMeta: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    changeFileChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.three,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    changeFileText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    previewPlayerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: Radius.lg,
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewPlayButton: {
      width: 40,
      height: 40,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    previewWaveform: {
      flex: 1,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 2,
    },
    previewWaveBar: {
      width: 3,
      borderRadius: Radius.pill,
    },
    previewTimeText: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 11,
      color: colors.textSecondary,
    },
    urlCard: {
      width: "100%",
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.four,
      gap: Spacing.three,
      ...cardShadow,
    },
    urlHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    urlInput: {
      width: "100%",
      minHeight: 48,
      paddingHorizontal: Spacing.three,
      borderRadius: Radius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      fontFamily: Fonts?.mono,
      fontSize: 13,
      color: colors.textPrimary,
    },
    formSection: {
      marginTop: Spacing.five,
      padding: Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    fieldHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one + 2,
      marginBottom: Spacing.two,
    },
    fieldLabel: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    titleInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: Radius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: Spacing.three,
    },
    titleInput: {
      flex: 1,
      minHeight: 48,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    clearInputBtn: {
      paddingLeft: Spacing.two,
    },
    footerBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.backgroundElevated,
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.three,
    },
    footerInner: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    cancelFooterBtn: {
      minHeight: Layout.controlHeightLarge,
      paddingHorizontal: Spacing.five,
      borderRadius: Radius.pill,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelFooterText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    saveFooterBtn: {
      flex: 1,
      minHeight: Layout.controlHeightLarge,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      ...floatingShadow,
    },
    saveFooterBtnDisabled: {
      opacity: 0.5,
    },
    saveFooterText: {
      ...Typography.label,
      fontFamily: Fonts?.sans,
      fontSize: 15,
      fontWeight: "800",
      color: colors.textInverse,
    },
    overlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.scrim,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: responsive.horizontalPadding,
      zIndex: 999,
    },
    overlayCard: {
      width: "100%",
      maxWidth: 380,
      borderRadius: Radius.xl,
      paddingHorizontal: Spacing.five,
      paddingVertical: Spacing.six,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
      ...floatingShadow,
    },
    topPillRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.four,
    },
    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1,
      borderColor: colors.border,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: Radius.pill,
      backgroundColor: colors.tealStrong,
    },
    liveBadgeText: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
      color: colors.tealStrong,
    },
    stepCounterText: {
      ...Typography.caption,
      fontFamily: Fonts?.mono,
      fontSize: 11,
      color: colors.textTertiary,
    },
    orbStage: {
      width: 120,
      height: 120,
      alignItems: "center",
      justifyContent: "center",
      marginVertical: Spacing.two,
    },
    pulseRing: {
      position: "absolute",
      width: 104,
      height: 104,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceSage,
      borderWidth: 1.5,
      borderColor: colors.teal,
    },
    waveformOrb: {
      width: 100,
      height: 100,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      ...cardShadow,
    },
    waveformRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: 54,
    },
    waveBar: {
      width: 3.5,
      borderRadius: Radius.pill,
      backgroundColor: colors.tealStrong,
    },
    overlayTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: 20,
      color: colors.textPrimary,
      textAlign: "center",
      marginTop: Spacing.three,
    },
    overlaySubtitle: {
      ...Typography.body,
      fontFamily: Fonts?.sans,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: Spacing.one,
    },
    progressTrack: {
      width: "100%",
      height: 6,
      borderRadius: Radius.pill,
      backgroundColor: colors.backgroundElement,
      overflow: "hidden",
      marginTop: Spacing.four,
    },
    progressFill: {
      height: "100%",
      borderRadius: Radius.pill,
      backgroundColor: colors.tealStrong,
    },
    interactiveHint: {
      ...Typography.caption,
      fontFamily: Fonts?.sans,
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: "center",
      marginTop: Spacing.three,
    },
  });
}