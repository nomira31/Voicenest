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
    type AlarmWeekday,
    type AppAlarm,
} from "@/lib/alarms/alarm-service";
import {
    DEFAULT_ALARM_SETTINGS,
    SETTINGS_SUPPORTED,
    SNOOZE_OPTIONS,
    VOLUME_LEVELS,
    nearestVolumeLevel,
    type AlarmSettings,
} from "@/lib/alarms/alarm-settings";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export type EditorTarget =
  | { mode: "create" }
  | { mode: "edit"; alarm: AppAlarm };

export type EditorValues = {
  recordingId: string;
  hour: number;
  minute: number;
  weekdays: AlarmWeekday[];
  settings: AlarmSettings;
};

export type AlarmEditorProps = {
  target: EditorTarget;
  onClose: () => void;
  onSubmit: (values: EditorValues, target: EditorTarget) => Promise<string | null>;
  onDelete: (alarm: AppAlarm) => void;
  onRecordNew: () => void;
};

export const DAY_OPTIONS: { id: AlarmWeekday; short: string; long: string }[] = [
  { id: 1, short: "M", long: "Mon" },
  { id: 2, short: "T", long: "Tue" },
  { id: 3, short: "W", long: "Wed" },
  { id: 4, short: "T", long: "Thu" },
  { id: 5, short: "F", long: "Fri" },
  { id: 6, short: "S", long: "Sat" },
  { id: 7, short: "S", long: "Sun" },
];

export const PRESETS: { label: string; days: AlarmWeekday[] }[] = [
  { label: "Once", days: [] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
  { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
];

export const sameDays = (a: AlarmWeekday[], b: AlarmWeekday[]) =>
  a.length === b.length && a.every((day) => b.includes(day));

export function clockParts(hour: number, minute: number) {
  return {
    time: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
    period: hour >= 12 ? "PM" : "AM",
  };
}

export function formatClock(hour: number, minute: number) {
  const { time, period } = clockParts(hour, minute);
  return `${time} ${period}`;
}

export function formatDuration(millis: number) {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function formatAlarmDays(weekdays: AlarmWeekday[]) {
  const preset = PRESETS.find((item) => item.days.length > 0 && sameDays(item.days, weekdays));
  if (weekdays.length === 0) return "One time";
  if (preset) return preset.label;
  return weekdays.map((day) => DAY_OPTIONS.find((option) => option.id === day)?.long).join(", ");
}

export function getNextFireFromSchedule(
  hour: number,
  minute: number,
  weekdays: AlarmWeekday[],
  from: number,
): Date | null {
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, minute, 0, 0);
    const isoDay = (((date.getDay() + 6) % 7) + 1) as AlarmWeekday;
    const dayAllowed = weekdays.length === 0 || weekdays.includes(isoDay);
    if (dayAllowed && date.getTime() > from) return date;
  }
  return null;
}

export function getNextFire(alarm: AppAlarm, from: number): Date | null {
  if (!alarm.enabled) return null;
  return getNextFireFromSchedule(alarm.hour, alarm.minute, alarm.weekdays, from);
}

export function formatUntil(millis: number) {
  const minutes = Math.max(0, Math.round(millis / 60000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} hr ${minutes % 60} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} hr` : `${days} d`;
}

function StepButton({
  icon,
  label,
  onStep,
  styles,
  colors,
}: {
  icon: "chevron-up" | "chevron-down";
  label: string;
  onStep: () => void;
  styles: ReturnType<typeof makeEditorStyles>;
  colors: Theme;
}) {
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  const stop = useCallback(() => {
    if (delay.current) clearTimeout(delay.current);
    if (loop.current) clearInterval(loop.current);
    delay.current = null;
    loop.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
      onPressIn={() => {
        stepRef.current();
        delay.current = setTimeout(() => {
          loop.current = setInterval(() => stepRef.current(), 90);
        }, 380);
      }}
      onPressOut={stop}
    >
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function AlarmEditor({
  target,
  onClose,
  onSubmit,
  onDelete,
  onRecordNew,
}: AlarmEditorProps) {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isWideLayout = responsive.isTablet || responsive.width >= 680;

  const styles = useMemo(
    () => makeEditorStyles(colors, isDark, responsive, isWideLayout),
    [
      colors,
      isDark,
      responsive.width,
      responsive.height,
      responsive.isCompact,
      responsive.isShort,
      responsive.isTablet,
      responsive.horizontalPadding,
      responsive.contentMaxWidth,
      isWideLayout,
    ],
  );

  const { recordings, playRecording, currentPlayingId, isPlaying } = useRecordings();
  const editing = target.mode === "edit" ? target.alarm : null;

  const [view, setView] = useState<"main" | "recordings">("main");
  const [recordingId, setRecordingId] = useState<string | null>(
    editing?.recordingId && recordings.some((r) => r.id === editing.recordingId)
      ? editing.recordingId
      : (recordings[0]?.id ?? null),
  );
  const [hour, setHour] = useState(editing?.hour ?? 7);
  const [minute, setMinute] = useState(editing?.minute ?? 0);
  const [weekdays, setWeekdays] = useState<AlarmWeekday[]>(
    editing?.weekdays ?? [1, 2, 3, 4, 5],
  );

  const initial = editing?.settings ?? DEFAULT_ALARM_SETTINGS;
  const [snoozeMinutes, setSnoozeMinutes] = useState(initial.snoozeMinutes);
  const [volume, setVolume] = useState(nearestVolumeLevel(initial.volume).value);
  const [gradualVolume, setGradualVolume] = useState(initial.gradualVolume);
  const [startingVolume, setStartingVolume] = useState(initial.startingVolume);
  const [volumeRampDurationSeconds, setVolumeRampDurationSeconds] = useState(
    initial.volumeRampDurationSeconds,
  );
  const [repeatRecording, setRepeatRecording] = useState(initial.repeatRecording);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recording = recordings.find((r) => r.id === recordingId) ?? null;
  const { time, period } = clockParts(hour, minute);

  const nextFirePreview = useMemo(
    () => getNextFireFromSchedule(hour, minute, weekdays, Date.now()),
    [hour, minute, weekdays],
  );

  function toggleDay(day: AlarmWeekday) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function handleBackOrClose() {
    if (view === "recordings") {
      setView("main");
      return;
    }
    onClose();
  }

  async function save() {
    if (saving) return;
    if (!recording) {
      setError("Choose a recording for this alarm.");
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSubmit(
      {
        recordingId: recording.id,
        hour,
        minute,
        weekdays,
        settings: {
          snoozeMinutes,
          volume,
          repeatRecording,
          gradualVolume,
          startingVolume,
          volumeRampDurationSeconds,
        },
      },
      target,
    );
    if (message) {
      setError(message);
      setSaving(false);
    }
  }

  const playingSelected = recording ? currentPlayingId === recording.id && isPlaying : false;

  return (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBackOrClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
        translucent={Platform.OS === "android"}
      />
      <SafeAreaView
        style={[
          styles.screen,
          Platform.OS === "android" && { paddingTop: Math.max(insets.top, Spacing.two) },
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarInner}>
            <TouchableOpacity
              style={styles.iconCircleButton}
              onPress={handleBackOrClose}
              activeOpacity={0.75}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={view === "recordings" ? "Back to alarm editor" : "Close"}
            >
              <Ionicons
                name={view === "recordings" ? "chevron-back" : "close"}
                size={21}
                color={colors.textPrimary}
              />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {view === "recordings"
                  ? "Choose a Recording"
                  : editing
                    ? "Edit Alarm"
                    : "New Alarm"}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {view === "recordings"
                  ? `${recordings.length} voice moment${recordings.length === 1 ? "" : "s"} available`
                  : nextFirePreview
                    ? `Rings in ${formatUntil(nextFirePreview.getTime() - Date.now())}`
                    : "Schedule your wake-up voice"}
              </Text>
            </View>

            {view === "main" && editing ? (
              <TouchableOpacity
                style={[styles.iconCircleButton, styles.deleteHeaderButton]}
                onPress={() => onDelete(editing)}
                activeOpacity={0.75}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Delete alarm"
              >
                <Ionicons name="trash-outline" size={19} color={colors.accentWarm} />
              </TouchableOpacity>
            ) : view === "recordings" && recordings.length > 0 ? (
              <TouchableOpacity
                style={styles.iconCircleButton}
                onPress={onRecordNew}
                activeOpacity={0.75}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Record a new voice"
              >
                <Ionicons name="mic-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconButtonSpacer} />
            )}
          </View>
        </View>

        {view === "recordings" ? (
          <View style={styles.body}>
            {recordings.length === 0 ? (
              <View style={styles.emptyRecordingsWrap}>
                <View style={styles.emptyRecordingsCard}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="mic-outline" size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>No voice recordings yet</Text>
                  <Text style={styles.emptyText}>
                    Record a personal voice note or affirmation first, then select it here to wake up to.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryPill}
                    onPress={onRecordNew}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Ionicons name="mic" size={17} color={colors.textInverse} />
                    <Text style={styles.primaryPillText}>Record a voice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.recordingsScrollContent,
                  { paddingBottom: Math.max(insets.bottom + Spacing.six, Spacing.eight) },
                ]}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.pageWidth}>
                  <View style={styles.recordingsGrid}>
                    {recordings.map((item) => {
                      const selected = item.id === recordingId;
                      const playingThis = currentPlayingId === item.id && isPlaying;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.recordingRow,
                            selected && styles.recordingRowSelected,
                          ]}
                          onPress={() => {
                            setRecordingId(item.id);
                            setError(null);
                            setView("main");
                          }}
                          activeOpacity={0.82}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Use ${item.title}`}
                        >
                          <View
                            style={[
                              styles.thumb,
                              { backgroundColor: colors[item.surface] },
                            ]}
                          >
                            <Ionicons
                              name={item.icon as any}
                              size={19}
                              color={colors.primary}
                            />
                          </View>

                          <View style={styles.flexFill}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              {formatDuration(item.durationMillis)} · {item.category}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.playButton,
                              playingThis && {
                                backgroundColor: colors.primary,
                                borderColor: colors.primary,
                              },
                            ]}
                            onPress={() => playRecording(item.id, item.uri)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${item.title}`}
                          >
                            <Ionicons
                              name={playingThis ? "pause" : "play"}
                              size={14}
                              color={playingThis ? colors.textInverse : colors.primary}
                            />
                          </TouchableOpacity>

                          <Ionicons
                            name={selected ? "checkmark-circle" : "ellipse-outline"}
                            size={23}
                            color={selected ? colors.primary : colors.textTertiary}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.body}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.pageWidth}>
                <View style={styles.columnsWrap}>
                  <View style={styles.column}>
                    <View style={styles.sectionBlockFirst}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionLabelInline}>Wake-up Time</Text>
                        <View style={styles.timeBadge}>
                          <Ionicons name="alarm-outline" size={13} color={colors.tealStrong} />
                          <Text style={styles.timeBadgeText}>
                            {formatClock(hour, minute)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.timeCard}>
                        <View style={styles.timePickerRow}>
                          <View style={styles.timeColumn}>
                            <StepButton
                              icon="chevron-up"
                              label="Increase hour"
                              onStep={() => setHour((h) => (h + 1) % 24)}
                              styles={styles}
                              colors={colors}
                            />
                            <Text style={styles.timeDigit}>{time.split(":")[0]}</Text>
                            <StepButton
                              icon="chevron-down"
                              label="Decrease hour"
                              onStep={() => setHour((h) => (h + 23) % 24)}
                              styles={styles}
                              colors={colors}
                            />
                          </View>

                          <Text style={styles.timeColon}>:</Text>

                          <View style={styles.timeColumn}>
                            <StepButton
                              icon="chevron-up"
                              label="Increase minute"
                              onStep={() => setMinute((m) => (m + 1) % 60)}
                              styles={styles}
                              colors={colors}
                            />
                            <Text style={styles.timeDigit}>
                              {String(minute).padStart(2, "0")}
                            </Text>
                            <StepButton
                              icon="chevron-down"
                              label="Decrease minute"
                              onStep={() => setMinute((m) => (m + 59) % 60)}
                              styles={styles}
                              colors={colors}
                            />
                          </View>

                          <View style={styles.periodStack}>
                            {(["AM", "PM"] as const).map((label) => {
                              const active = period === label;
                              return (
                                <TouchableOpacity
                                  key={label}
                                  style={[
                                    styles.periodOption,
                                    active && styles.periodOptionActive,
                                  ]}
                                  onPress={() =>
                                    setHour((h) =>
                                      label === "AM" ? h % 12 : (h % 12) + 12,
                                    )
                                  }
                                  activeOpacity={0.8}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: active }}
                                >
                                  <Text
                                    style={[
                                      styles.periodText,
                                      active && styles.periodTextActive,
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                        <Text style={styles.hintInside}>
                          Tap or hold the arrows to adjust hours and minutes.
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sectionBlock}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionLabelInline}>Voice Recording</Text>
                        {recording ? (
                          <TouchableOpacity
                            onPress={() => setView("recordings")}
                            hitSlop={8}
                            accessibilityRole="button"
                          >
                            <Text style={styles.changeText}>Change</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.recordingCard}
                        onPress={() => setView("recordings")}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel="Choose or change alarm recording"
                      >
                        {recording ? (
                          <>
                            <View
                              style={[
                                styles.thumbLarge,
                                { backgroundColor: colors[recording.surface] },
                              ]}
                            >
                              <Ionicons
                                name={recording.icon as any}
                                size={24}
                                color={colors.primary}
                              />
                            </View>
                            <View style={styles.flexFill}>
                              <Text style={styles.recordingCardTitle} numberOfLines={1}>
                                {recording.title}
                              </Text>
                              <Text style={styles.rowMeta} numberOfLines={1}>
                                {formatDuration(recording.durationMillis)} · Plays when alarm rings
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.playButtonLarge,
                                playingSelected && {
                                  backgroundColor: colors.primary,
                                  borderColor: colors.primary,
                                },
                              ]}
                              onPress={() => playRecording(recording.id, recording.uri)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Preview ${recording.title}`}
                            >
                              <Ionicons
                                name={playingSelected ? "pause" : "play"}
                                size={15}
                                color={playingSelected ? colors.textInverse : colors.primary}
                              />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <View
                              style={[
                                styles.thumbLarge,
                                { backgroundColor: colors.backgroundSubtle },
                              ]}
                            >
                              <Ionicons
                                name="musical-notes-outline"
                                size={24}
                                color={colors.textSecondary}
                              />
                            </View>
                            <View style={styles.flexFill}>
                              <Text style={styles.recordingCardTitle}>
                                Choose a recording
                              </Text>
                              <Text style={styles.rowMeta}>
                                Pick the voice moment you want to wake up to
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color={colors.textSecondary}
                            />
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    <View style={styles.sectionBlock}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionLabelInline}>Repeat Schedule</Text>
                        <Text style={styles.sectionValue}>
                          {formatAlarmDays(weekdays)}
                        </Text>
                      </View>

                      <View style={styles.panelCard}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.presetRow}
                        >
                          {PRESETS.map((preset) => {
                            const active = sameDays(preset.days, weekdays);
                            return (
                              <TouchableOpacity
                                key={preset.label}
                                style={[styles.preset, active && styles.presetActive]}
                                onPress={() => setWeekdays(preset.days)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                              >
                                <Text
                                  style={[
                                    styles.presetText,
                                    active && styles.presetTextActive,
                                  ]}
                                >
                                  {preset.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        <View style={styles.daysRow}>
                          {DAY_OPTIONS.map((day) => {
                            const selected = weekdays.includes(day.id);
                            return (
                              <TouchableOpacity
                                key={day.id}
                                style={[
                                  styles.dayChip,
                                  selected && styles.dayChipSelected,
                                ]}
                                onPress={() => toggleDay(day.id)}
                                activeOpacity={0.8}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                                accessibilityLabel={day.long}
                              >
                                <Text
                                  style={[
                                    styles.dayChipText,
                                    selected && styles.dayChipTextSelected,
                                  ]}
                                >
                                  {day.short}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.column}>
                    {SETTINGS_SUPPORTED ? (
                      <>
                        <View style={isWideLayout ? styles.sectionBlockFirst : styles.sectionBlock}>
                          <View style={styles.sectionHeader}>
                            <Text style={styles.sectionLabelInline}>Snooze Duration</Text>
                            <Text style={styles.sectionValue}>
                              {snoozeMinutes === 0 ? "Disabled" : `${snoozeMinutes} min`}
                            </Text>
                          </View>
                          <View style={styles.optionRow}>
                            {SNOOZE_OPTIONS.map((minutes) => {
                              const active = snoozeMinutes === minutes;
                              return (
                                <TouchableOpacity
                                  key={minutes}
                                  style={[styles.option, active && styles.optionActive]}
                                  onPress={() => setSnoozeMinutes(minutes)}
                                  activeOpacity={0.8}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: active }}
                                >
                                  <Text
                                    style={[
                                      styles.optionText,
                                      active && styles.optionTextActive,
                                    ]}
                                  >
                                    {minutes === 0 ? "Off" : `${minutes}m`}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <Text style={styles.hint}>
                            {snoozeMinutes === 0
                              ? "The alarm stops immediately when you tap Stop."
                              : `Snooze rings again in ${snoozeMinutes} minutes.`}
                          </Text>
                        </View>

                        <View style={styles.sectionBlock}>
                          <View style={styles.sectionHeader}>
                            <Text style={styles.sectionLabelInline}>Alarm Volume</Text>
                            <Text style={styles.sectionValue}>
                              {Math.round(volume * 100)}%
                            </Text>
                          </View>
                          <View style={styles.optionRow}>
                            {VOLUME_LEVELS.map((level) => {
                              const active = volume === level.value;
                              return (
                                <TouchableOpacity
                                  key={level.label}
                                  style={[styles.option, active && styles.optionActive]}
                                  onPress={() => setVolume(level.value)}
                                  activeOpacity={0.8}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: active }}
                                  accessibilityLabel={`${level.label} volume`}
                                >
                                  <Ionicons
                                    name={level.icon as any}
                                    size={16}
                                    color={active ? colors.textInverse : colors.textSecondary}
                                  />
                                  <Text
                                    style={[
                                      styles.optionText,
                                      active && styles.optionTextActive,
                                    ]}
                                  >
                                    {level.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        <View style={styles.sectionBlock}>
                          <Text style={styles.sectionLabel}>Playback Behavior</Text>

                          <View style={styles.toggleCard}>
                            <View style={styles.toggleRowInner}>
                              <View style={styles.flexFill}>
                                <Text style={styles.toggleTitle}>
                                  Gradually increase volume
                                </Text>
                                <Text style={styles.rowMeta}>
                                  {gradualVolume
                                    ? `Ramps from ${Math.round(startingVolume * 100)}% to ${Math.round(volume * 100)}% over ${volumeRampDurationSeconds}s`
                                    : "Starts immediately at your target volume"}
                                </Text>
                              </View>
                              <Switch
                                value={gradualVolume}
                                onValueChange={setGradualVolume}
                                trackColor={{
                                  false: colors.borderStrong,
                                  true: colors.tealStrong,
                                }}
                                thumbColor={
                                  gradualVolume
                                    ? colors.backgroundElevated
                                    : colors.backgroundSubtle
                                }
                                accessibilityLabel="Gradually increase alarm volume"
                              />
                            </View>

                            {gradualVolume ? (
                              <View style={styles.rampSubSection}>
                                <Text style={styles.subSectionLabel}>
                                  Starting volume
                                </Text>
                                <View style={styles.optionRow}>
                                  {[0.1, 0.2, 0.3, 0.4].map((level) => {
                                    const active = startingVolume === level;
                                    return (
                                      <TouchableOpacity
                                        key={level}
                                        style={[
                                          styles.optionCompact,
                                          active && styles.optionActive,
                                        ]}
                                        onPress={() => setStartingVolume(level)}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`Start at ${Math.round(level * 100)} percent`}
                                      >
                                        <Text
                                          style={[
                                            styles.optionText,
                                            active && styles.optionTextActive,
                                          ]}
                                        >
                                          {Math.round(level * 100)}%
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>

                                <Text style={styles.subSectionLabel}>
                                  Ramp duration
                                </Text>
                                <View style={styles.optionRow}>
                                  {[15, 30, 60].map((seconds) => {
                                    const active =
                                      volumeRampDurationSeconds === seconds;
                                    return (
                                      <TouchableOpacity
                                        key={seconds}
                                        style={[
                                          styles.optionCompact,
                                          active && styles.optionActive,
                                        ]}
                                        onPress={() =>
                                          setVolumeRampDurationSeconds(seconds)
                                        }
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                      >
                                        <Text
                                          style={[
                                            styles.optionText,
                                            active && styles.optionTextActive,
                                          ]}
                                        >
                                          {seconds} sec
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </View>
                            ) : null}
                          </View>

                          <View style={[styles.toggleCard, styles.toggleCardSpaced]}>
                            <View style={styles.toggleRowInner}>
                              <View style={styles.flexFill}>
                                <Text style={styles.toggleTitle}>
                                  Repeat voice recording
                                </Text>
                                <Text style={styles.rowMeta}>
                                  {repeatRecording
                                    ? "Loops continuously until you snooze or dismiss"
                                    : "Plays through once, then stops"}
                                </Text>
                              </View>
                              <Switch
                                value={repeatRecording}
                                onValueChange={setRepeatRecording}
                                trackColor={{
                                  false: colors.borderStrong,
                                  true: colors.tealStrong,
                                }}
                                thumbColor={
                                  repeatRecording
                                    ? colors.backgroundElevated
                                    : colors.backgroundSubtle
                                }
                                accessibilityLabel="Repeat recording"
                              />
                            </View>
                          </View>
                        </View>
                      </>
                    ) : null}

                    {editing ? (
                      <TouchableOpacity
                        style={styles.deleteButtonCard}
                        onPress={() => onDelete(editing)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={colors.accentWarm}
                        />
                        <Text style={styles.deleteText}>Delete this alarm</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
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
                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={17}
                      color={colors.danger}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.footerActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                    disabled={saving}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      (saving || !recording) && styles.buttonDisabled,
                    ]}
                    onPress={() => void save()}
                    disabled={saving || !recording}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color={colors.textInverse}
                      />
                    )}
                    <Text style={styles.saveButtonText} numberOfLines={1}>
                      {saving
                        ? "Saving..."
                        : editing
                          ? "Save Changes"
                          : `Set for ${formatClock(hour, minute)}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function makeEditorStyles(
  colors: Theme,
  isDark: boolean,
  responsive: ReturnType<typeof useResponsiveLayout>,
  isWideLayout: boolean,
) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const sans = Fonts?.sans;
  const dayChipSize = responsive.isCompact ? 38 : responsive.isTablet ? 48 : 43;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: responsive.horizontalPadding,
      paddingVertical: Spacing.two,
    },
    topBarInner: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
      minHeight: Layout.iconButton,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.three,
    },
    iconCircleButton: {
      width: Layout.iconButton,
      height: Layout.iconButton,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteHeaderButton: {
      borderColor: colors.border,
      backgroundColor: colors.backgroundElevated,
    },
    iconButtonSpacer: {
      width: Layout.iconButton,
      height: Layout.iconButton,
    },
    headerCenter: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
    },
    headerTitle: {
      ...Typography.title,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 18 : responsive.isTablet ? 22 : 20,
      lineHeight: responsive.isTablet ? 28 : 25,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      color: colors.tealStrong,
      fontWeight: "600",
      marginTop: 1,
    },
    body: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.four,
      paddingBottom: Spacing.seven,
    },
    recordingsScrollContent: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.four,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    columnsWrap: {
      flexDirection: isWideLayout ? "row" : "column",
      alignItems: "flex-start",
      gap: isWideLayout ? Spacing.five : 0,
    },
    column: {
      flex: 1,
      width: "100%",
      minWidth: 0,
    },
    flexFill: {
      flex: 1,
      minWidth: 0,
    },
    sectionBlockFirst: {
      marginTop: 0,
    },
    sectionBlock: {
      marginTop: Spacing.five,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.two,
      gap: Spacing.two,
    },
    sectionLabel: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: Spacing.two,
    },
    sectionLabelInline: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    sectionValue: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    timeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: Spacing.two + 2,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      backgroundColor: colors.surfaceTeal,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeBadgeText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    timeCard: {
      paddingVertical: responsive.isShort ? Spacing.two : Spacing.four,
      paddingHorizontal: Spacing.three,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      ...cardShadow,
    },
    timePickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: responsive.isCompact ? Spacing.one : Spacing.two,
    },
    timeColumn: {
      width: responsive.isCompact ? 68 : responsive.isTablet ? 90 : 78,
      alignItems: "center",
    },
    stepButton: {
      width: 58,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: Radius.md,
    },
    stepButtonPressed: {
      backgroundColor: colors.backgroundSubtle,
    },
    timeDigit: {
      ...Typography.displayXL,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 42 : responsive.isTablet ? 56 : 48,
      lineHeight: responsive.isCompact ? 48 : responsive.isTablet ? 64 : 56,
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    timeColon: {
      ...Typography.displayXL,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 34 : 42,
      lineHeight: responsive.isCompact ? 40 : 48,
      color: colors.primary,
      marginBottom: 4,
    },
    periodStack: {
      gap: Spacing.one + 2,
      marginLeft: responsive.isCompact ? Spacing.two : Spacing.three,
    },
    periodOption: {
      minWidth: responsive.isCompact ? 50 : 56,
      paddingVertical: Spacing.two,
      paddingHorizontal: Spacing.two,
      alignItems: "center",
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    periodOptionActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    periodText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    periodTextActive: {
      color: colors.textInverse,
    },
    hintInside: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: "center",
      marginTop: Spacing.two,
    },
    hint: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      lineHeight: 16,
      color: colors.textTertiary,
      marginTop: Spacing.two,
    },
    recordingCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    recordingCardTitle: {
      ...Typography.title,
      fontFamily: sans,
      fontSize: 15,
      color: colors.textPrimary,
    },
    changeText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 13,
      fontWeight: "700",
      color: colors.tealStrong,
    },
    thumb: {
      width: 42,
      height: 42,
      borderRadius: Radius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbLarge: {
      width: 50,
      height: 50,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    playButton: {
      width: 34,
      height: 34,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    playButtonLarge: {
      width: 38,
      height: 38,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },
    panelCard: {
      padding: Spacing.three,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    presetRow: {
      gap: Spacing.two,
      paddingBottom: Spacing.three,
    },
    preset: {
      paddingHorizontal: Spacing.three + 2,
      paddingVertical: Spacing.two,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    presetActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    presetText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    presetTextActive: {
      color: colors.textInverse,
    },
    daysRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: Spacing.one,
    },
    dayChip: {
      width: dayChipSize,
      height: dayChipSize,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    dayChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dayChipText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: responsive.isCompact ? 12 : 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    dayChipTextSelected: {
      color: colors.textInverse,
    },
    optionRow: {
      flexDirection: "row",
      gap: Spacing.two,
    },
    option: {
      flex: 1,
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.one,
      paddingVertical: Spacing.two + 2,
      paddingHorizontal: Spacing.two,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundElevated,
    },
    optionCompact: {
      flex: 1,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: Spacing.two,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    optionActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: responsive.isCompact ? 12 : 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    optionTextActive: {
      color: colors.textInverse,
    },
    toggleCard: {
      padding: Spacing.three,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    toggleCardSpaced: {
      marginTop: Spacing.three,
    },
    toggleRowInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    toggleTitle: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rampSubSection: {
      marginTop: Spacing.three,
      paddingTop: Spacing.three,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    subSectionLabel: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: Spacing.two,
      marginTop: Spacing.two,
    },
    deleteButtonCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      marginTop: Spacing.five,
      paddingVertical: Spacing.three,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundElevated,
    },
    deleteText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.accentWarm,
    },
    emptyRecordingsWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: responsive.horizontalPadding,
    },
    emptyRecordingsCard: {
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
      padding: Spacing.six,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    emptyIconCircle: {
      width: 56,
      height: 56,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceYellow,
      marginBottom: Spacing.three,
    },
    emptyTitle: {
      ...Typography.title,
      fontFamily: sans,
      fontSize: 17,
      color: colors.textPrimary,
      textAlign: "center",
    },
    emptyText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: Spacing.two,
      marginBottom: Spacing.four,
    },
    primaryPill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      minHeight: 46,
      paddingHorizontal: Spacing.five,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
    },
    primaryPillText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse,
    },
    recordingsGrid: {
      flexDirection: isWideLayout ? "row" : "column",
      flexWrap: isWideLayout ? "wrap" : "nowrap",
      gap: Spacing.three,
    },
    recordingRow: {
      width: isWideLayout ? "48.5%" : "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundElevated,
      ...cardShadow,
    },
    recordingRowSelected: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    rowTitle: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rowMeta: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      marginTop: 2,
      color: colors.textSecondary,
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
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      marginBottom: Spacing.three,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
      borderRadius: Radius.md,
      backgroundColor: colors.dangerSoft,
    },
    errorText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      lineHeight: 17,
      color: colors.danger,
      flex: 1,
    },
    footerActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    cancelButton: {
      minHeight: Layout.controlHeightLarge,
      paddingHorizontal: Spacing.five,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    saveButton: {
      flex: 1,
      minHeight: Layout.controlHeightLarge,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      paddingHorizontal: Spacing.four,
    },
    saveButtonText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 15,
      fontWeight: "800",
      color: colors.textInverse,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
  });
}