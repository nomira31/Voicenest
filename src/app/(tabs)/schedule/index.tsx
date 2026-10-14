import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Fonts,
  Layout,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
  type Theme,
} from "@/constants/theme";
import { useRecordingModal } from "@/contexts/recording-modal-context";
import { useRecordings } from "@/contexts/recordings-context";
import { clearAlarmLog, readAlarmLog } from "@/lib/alarms/alarm-log";
import {
  createAlarm,
  deleteAlarm,
  getAlarmPermissions,
  getAlarms,
  getStoredAlarms,
  requestAlarmPermissions,
  setAlarmEnabled,
  updateAlarm, // <- new, see alarm-service-additions.ts
  type AlarmWeekday,
  type AppAlarm,
  type CreateAlarmInput,
} from "@/lib/alarms/alarm-service";
import {
  DEFAULT_ALARM_SETTINGS,
  SETTINGS_SUPPORTED,
  SNOOZE_OPTIONS,
  VOLUME_LEVELS,
  describeSettings,
  nearestVolumeLevel,
  type AlarmSettings,
} from "@/lib/alarms/alarm-settings";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/* ───────────────────────── helpers ───────────────────────── */

const DAY_OPTIONS: { id: AlarmWeekday; short: string; long: string }[] = [
  { id: 1, short: "M", long: "Mon" },
  { id: 2, short: "T", long: "Tue" },
  { id: 3, short: "W", long: "Wed" },
  { id: 4, short: "T", long: "Thu" },
  { id: 5, short: "F", long: "Fri" },
  { id: 6, short: "S", long: "Sat" },
  { id: 7, short: "S", long: "Sun" },
];

const PRESETS: { label: string; days: AlarmWeekday[] }[] = [
  { label: "Once", days: [] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
  { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sameDays = (a: AlarmWeekday[], b: AlarmWeekday[]) =>
  a.length === b.length && a.every((day) => b.includes(day));
const byTime = (a: AppAlarm, b: AppAlarm) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

function clockParts(hour: number, minute: number) {
  return {
    time: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
    period: hour >= 12 ? "PM" : "AM",
  };
}

function formatClock(hour: number, minute: number) {
  const { time, period } = clockParts(hour, minute);
  return `${time} ${period}`;
}

function formatDuration(millis: number) {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function formatAlarmDays(weekdays: AlarmWeekday[]) {
  const preset = PRESETS.find((item) => item.days.length > 0 && sameDays(item.days, weekdays));
  if (weekdays.length === 0) return "One time";
  if (preset) return preset.label;
  return weekdays.map((day) => DAY_OPTIONS.find((option) => option.id === day)?.long).join(", ");
}

/** Next moment this alarm will ring, or null if it's off. */
function getNextFire(alarm: AppAlarm, from: number): Date | null {
  if (!alarm.enabled) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    date.setHours(alarm.hour, alarm.minute, 0, 0);
    const isoDay = (((date.getDay() + 6) % 7) + 1) as AlarmWeekday;
    const dayAllowed = alarm.weekdays.length === 0 || alarm.weekdays.includes(isoDay);
    if (dayAllowed && date.getTime() > from) return date;
  }
  return null;
}

function formatUntil(millis: number) {
  const minutes = Math.max(0, Math.round(millis / 60000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} hr ${minutes % 60} min` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} hr` : `${days} d`;
}

/* ───────────────────────── editor sheet ───────────────────────── */

type EditorTarget = { mode: "create" } | { mode: "edit"; alarm: AppAlarm };
type EditorValues = {
  recordingId: string;
  hour: number;
  minute: number;
  weekdays: AlarmWeekday[];
  settings: AlarmSettings;
};

/** Press once to step, hold to keep stepping. */
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
  styles: ReturnType<typeof makeStyles>;
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
      hitSlop={6}
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

function AlarmEditor({
  target,
  onClose,
  onSubmit,
  onDelete,
  onRecordNew,
  styles,
  colors,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSubmit: (values: EditorValues, target: EditorTarget) => Promise<string | null>;
  onDelete: (alarm: AppAlarm) => void;
  onRecordNew: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Theme;
}) {
  const insets = useSafeAreaInsets();
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
  const [weekdays, setWeekdays] = useState<AlarmWeekday[]>(editing?.weekdays ?? [1, 2, 3, 4, 5]);
  const initial = editing?.settings ?? DEFAULT_ALARM_SETTINGS;
  const [snoozeMinutes, setSnoozeMinutes] = useState(initial.snoozeMinutes);
  const [volume, setVolume] = useState(nearestVolumeLevel(initial.volume).value);
  const [gradualVolume, setGradualVolume] = useState(initial.gradualVolume);
  const [startingVolume, setStartingVolume] = useState(initial.startingVolume);
  const [volumeRampDurationSeconds, setVolumeRampDurationSeconds] = useState(initial.volumeRampDurationSeconds);
  const [repeatRecording, setRepeatRecording] = useState(initial.repeatRecording);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recording = recordings.find((r) => r.id === recordingId) ?? null;
  const { time, period } = clockParts(hour, minute);

  function toggleDay(day: AlarmWeekday) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
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

  const sheetPadding = { paddingBottom: Math.max(insets.bottom, Spacing.four) };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, sheetPadding]}>
          <View style={styles.grabber} />

          {view === "recordings" ? (
            <>
              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  style={styles.roundButton}
                  onPress={() => setView("main")}
                  accessibilityLabel="Back"
                >
                  <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>Choose a recording</Text>
                <View style={styles.roundButtonSpacer} />
              </View>

              {recordings.length === 0 ? (
                <View style={styles.noRecordings}>
                  <Ionicons name="mic-outline" size={26} color={colors.textSecondary} />
                  <Text style={styles.emptyText}>
                    You don't have any recordings yet. Record one, then come back to set an alarm.
                  </Text>
                  <TouchableOpacity style={styles.primaryPill} onPress={onRecordNew} activeOpacity={0.85}>
                    <Ionicons name="mic" size={16} color={colors.textInverse} />
                    <Text style={styles.primaryPillText}>Record a voice</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.listGap}>
                    {recordings.map((item) => {
                      const selected = item.id === recordingId;
                      const playingThis = currentPlayingId === item.id && isPlaying;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.recordingRow, selected && styles.recordingRowSelected]}
                          onPress={() => {
                            setRecordingId(item.id);
                            setError(null);
                            setView("main");
                          }}
                          activeOpacity={0.8}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Use ${item.title}`}
                        >
                          <View style={[styles.thumb, { backgroundColor: colors[item.surface] }]}>
                            <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                          </View>
                          <View style={styles.flexFill}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.rowMeta}>
                              {formatDuration(item.durationMillis)}, {item.category}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.playButton, playingThis && { backgroundColor: colors.primary }]}
                            onPress={() => playRecording(item.id, item.uri)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${item.title}`}
                          >
                            <Ionicons
                              name={playingThis ? "pause" : "play"}
                              size={13}
                              color={playingThis ? colors.textInverse : colors.primary}
                            />
                          </TouchableOpacity>
                          {selected ? (
                            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={22} color={colors.textTertiary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <TouchableOpacity style={styles.roundButton} onPress={onClose} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>{editing ? "Edit alarm" : "New alarm"}</Text>
                <View style={styles.roundButtonSpacer} />
              </View>

              <ScrollView
                style={styles.sheetScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetContent}
              >
                {/* Recording */}
                <TouchableOpacity
                  style={styles.recordingCard}
                  onPress={() => setView("recordings")}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Change recording"
                >
                  {recording ? (
                    <>
                      <View style={[styles.thumbLarge, { backgroundColor: colors[recording.surface] }]}>
                        <Ionicons name={recording.icon as any} size={24} color={colors.primary} />
                      </View>
                      <View style={styles.flexFill}>
                        <Text style={styles.recordingCardTitle} numberOfLines={1}>{recording.title}</Text>
                        <Text style={styles.rowMeta}>Plays when the alarm rings</Text>
                      </View>
                      <Text style={styles.changeText}>Change</Text>
                    </>
                  ) : (
                    <>
                      <View style={[styles.thumbLarge, { backgroundColor: colors.backgroundSubtle }]}>
                        <Ionicons name="musical-notes-outline" size={24} color={colors.textSecondary} />
                      </View>
                      <View style={styles.flexFill}>
                        <Text style={styles.recordingCardTitle}>Choose a recording</Text>
                        <Text style={styles.rowMeta}>Pick the voice you want to wake up to</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </>
                  )}
                </TouchableOpacity>

                {/* Time */}
                <Text style={styles.sectionLabel}>Time</Text>
                <View style={styles.timeCard}>
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
                    <Text style={styles.timeDigit}>{String(minute).padStart(2, "0")}</Text>
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
                          style={[styles.periodOption, active && styles.periodOptionActive]}
                          onPress={() => setHour((h) => (label === "AM" ? h % 12 : (h % 12) + 12))}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <Text style={styles.hint}>Hold the arrows to change the time faster.</Text>

                {/* Repeat */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>Repeat</Text>
                  <Text style={styles.sectionValue}>{formatAlarmDays(weekdays)}</Text>
                </View>
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
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.presetText, active && styles.presetTextActive]}>{preset.label}</Text>
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
                        style={[styles.dayChip, selected && styles.dayChipSelected]}
                        onPress={() => toggleDay(day.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={day.long}
                      >
                        <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                          {day.short}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {SETTINGS_SUPPORTED ? (
                  <>
                    <Text style={styles.sectionLabel}>Snooze</Text>
                    <View style={styles.optionRow}>
                      {SNOOZE_OPTIONS.map((minutes) => {
                        const active = snoozeMinutes === minutes;
                        return (
                          <TouchableOpacity
                            key={minutes}
                            style={[styles.option, active && styles.optionActive]}
                            onPress={() => setSnoozeMinutes(minutes)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text style={[styles.optionText, active && styles.optionTextActive]}>
                              {minutes === 0 ? "Off" : `${minutes} min`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.hint}>
                      {snoozeMinutes === 0
                        ? "The alarm stops when you tap Stop."
                        : `Snooze rings again in ${snoozeMinutes} min. Dismiss turns it off and opens the app.`}
                    </Text>

                    <Text style={styles.sectionLabel}>Volume</Text>
                    <View style={styles.optionRow}>
                      {VOLUME_LEVELS.map((level) => {
                        const active = volume === level.value;
                        return (
                          <TouchableOpacity
                            key={level.label}
                            style={[styles.option, active && styles.optionActive]}
                            onPress={() => setVolume(level.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${level.label} volume`}
                          >
                            <Ionicons
                              name={level.icon as any}
                              size={16}
                              color={active ? colors.textInverse : colors.textSecondary}
                            />
                            <Text style={[styles.optionText, active && styles.optionTextActive]}>{level.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.hint}>
                      {gradualVolume
                        ? "The alarm starts quietly and increases to the selected volume."
                        : "The selected volume is maintained while the alarm rings."}
                    </Text>

                    <View style={styles.toggleRow}>
                      <View style={styles.flexFill}>
                        <Text style={styles.toggleTitle}>Gradually increase volume</Text>
                        <Text style={styles.rowMeta}>
                          {gradualVolume
                            ? `Starts at ${Math.round(startingVolume * 100)}% and reaches ${Math.round(volume * 100)}% in ${volumeRampDurationSeconds} seconds`
                            : "Play at the selected volume immediately"}
                        </Text>
                      </View>
                      <Switch
                        value={gradualVolume}
                        onValueChange={setGradualVolume}
                        trackColor={{ false: colors.borderStrong, true: colors.tealStrong }}
                        thumbColor={gradualVolume ? colors.backgroundElevated : colors.backgroundSubtle}
                        accessibilityLabel="Gradually increase alarm volume"
                      />
                    </View>

                    {gradualVolume ? (
                      <>
                        <Text style={styles.sectionLabel}>Starting volume</Text>
                        <View style={styles.optionRow}>
                          {[0.1, 0.2, 0.3, 0.4].map((level) => {
                            const active = startingVolume === level;
                            return (
                              <TouchableOpacity
                                key={level}
                                style={[styles.option, active && styles.optionActive]}
                                onPress={() => setStartingVolume(level)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`Start at ${Math.round(level * 100)} percent`}
                              >
                                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                                  {Math.round(level * 100)}%
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <Text style={styles.sectionLabel}>Time to reach full volume</Text>
                        <View style={styles.optionRow}>
                          {[15, 30, 60].map((seconds) => {
                            const active = volumeRampDurationSeconds === seconds;
                            return (
                              <TouchableOpacity
                                key={seconds}
                                style={[styles.option, active && styles.optionActive]}
                                onPress={() => setVolumeRampDurationSeconds(seconds)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                              >
                                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                                  {seconds} sec
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={styles.hint}>
                          The alarm volume rises gradually while it rings. Your selected target volume is {Math.round(volume * 100)}%.
                        </Text>
                      </>
                    ) : null}

                    <View style={styles.toggleRow}>
                      <View style={styles.flexFill}>
                        <Text style={styles.toggleTitle}>Repeat recording</Text>
                        <Text style={styles.rowMeta}>
                          {repeatRecording ? "Loops until you respond" : "Plays once, then stops"}
                        </Text>
                      </View>
                      <Switch
                        value={repeatRecording}
                        onValueChange={setRepeatRecording}
                        trackColor={{ false: colors.borderStrong, true: colors.tealStrong }}
                        thumbColor={repeatRecording ? colors.backgroundElevated : colors.backgroundSubtle}
                        accessibilityLabel="Repeat recording"
                      />
                    </View>
                  </>
                ) : null}

                {editing ? (
                  <TouchableOpacity
                    style={styles.deleteRow}
                    onPress={() => onDelete(editing)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.accentWarm} />
                    <Text style={styles.deleteText}>Delete alarm</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>

              <View style={styles.footer}>
                {error ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.saveButton, (saving || !recording) && styles.buttonDisabled]}
                  onPress={() => void save()}
                  disabled={saving || !recording}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  {saving ? <ActivityIndicator color={colors.textInverse} /> : null}
                  <Text style={styles.saveButtonText}>
                    {saving ? "Saving..." : editing ? "Save changes" : `Set alarm for ${formatClock(hour, minute)}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ───────────────────────── screen ───────────────────────── */

export default function ScheduleScreen() {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { dialog, showAlert, showConfirm } = useAppDialog();
  const { openRecordModal } = useRecordingModal();
  const { recordings, playRecording, currentPlayingId, isPlaying } = useRecordings();

  const [alarms, setAlarms] = useState<AppAlarm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [permissionState, setPermissionState] = useState<{
    nativeAvailable: boolean;
    exactAlarm: boolean;
    fullScreen: boolean;
    notifications: boolean;
    status: string;
  } | null>(null);

  const showAlertRef = useRef(showAlert);
  showAlertRef.current = showAlert;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keeps "rings in ..." fresh without being noisy.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  const loadPermissions = useCallback(async () => {
    const permissions = await getAlarmPermissions();
    if (permissions) {
      setPermissionState({
        nativeAvailable: permissions.status !== "unavailable",
        exactAlarm: permissions.canScheduleExactAlarms,
        fullScreen: permissions.canUseFullScreenIntent !== false,
        notifications: permissions.canPostNotifications !== false,
        status: permissions.status,
      });
    } else {
      setPermissionState(null);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      setAlarms(await getStoredAlarms());
    } catch (error) {
      console.error("Unable to load alarms:", error);
      void showAlertRef.current("Couldn't load alarms", "Your saved alarms could not be loaded.");
    } finally {
      setIsLoading(false);
    }
    try {
      setAlarms(await getAlarms());
    } catch (error) {
      console.warn("Alarm sync skipped:", error);
    }
    await loadPermissions().catch(() => undefined);
    setNow(Date.now());
  }, [loadPermissions]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const next = useMemo(() => {
    let best: { alarm: AppAlarm; date: Date } | null = null;
    for (const alarm of alarms) {
      const date = getNextFire(alarm, now);
      if (date && (!best || date < best.date)) best = { alarm, date };
    }
    return best;
  }, [alarms, now]);

  const needsPermissionAttention =
    permissionState !== null &&
    (permissionState.status === "unavailable" ||
      !permissionState.exactAlarm ||
      !permissionState.fullScreen ||
      !permissionState.notifications);

  /* ── CRUD ── */

  const handleSubmit = useCallback(
    async (values: EditorValues, target: EditorTarget): Promise<string | null> => {
      const recording = recordings.find((r) => r.id === values.recordingId);
      if (!recording) return "That recording is no longer available. Choose another one.";

      const payload: CreateAlarmInput = {
        title: recording.title,
        hour: values.hour,
        minute: values.minute,
        weekdays: values.weekdays,
        recordingId: recording.id,
        recordingUri: recording.uri,
        recordingTitle: recording.title,
        recordingDurationMillis: recording.durationMillis,
        settings: values.settings,
      };

      try {
        const result =
          target.mode === "edit"
            ? await updateAlarm(target.alarm, payload)
            : await createAlarm(payload);

        setAlarms((previous) =>
          [result.alarm, ...previous.filter((item) => item.id !== result.alarm.id)].sort(byTime),
        );
        setEditor(null);
        void loadPermissions().catch(() => undefined);

        const fire = getNextFire(result.alarm, Date.now());
        const summary = fire
          ? `Alarm set. Rings in ${formatUntil(fire.getTime() - Date.now())}.`
          : "Alarm saved.";

        if (result.notice) {
          // Wait for the sheet to finish closing so the dialog can appear on iOS.
          void wait(380).then(() => showAlertRef.current("Alarm saved", result.notice as string));
        } else {
          showToast(summary);
        }
        return null;
      } catch (error) {
        console.error("Could not save alarm:", error);
        return error instanceof Error
          ? error.message
          : "The alarm couldn't be saved. Check your permissions and try again.";
      }
    },
    [recordings, loadPermissions],
  );

  async function handleToggle(alarm: AppAlarm, nextEnabled: boolean) {
    // Optimistic: the switch moves instantly, and rolls back if the OS refuses.
    setAlarms((previous) => previous.map((item) => (item.id === alarm.id ? { ...item, enabled: nextEnabled } : item)));
    try {
      const updated = await setAlarmEnabled(alarm, nextEnabled);
      setAlarms((previous) => previous.map((item) => (item.id === alarm.id ? updated : item)));
      if (nextEnabled) {
        const fire = getNextFire(updated, Date.now());
        if (fire) showToast(`Rings in ${formatUntil(fire.getTime() - Date.now())}.`);
        if (updated.delivery !== "native") {
          await showAlert(
            "Limited alarm mode",
            updated.delivery === "native-no-full-screen"
              ? "The alarm is on, but full-screen alarm access is off. It may show as a banner instead of taking over the lock screen."
              : "This alarm uses a standard notification, so it may not ring continuously.",
          );
        }
      }
    } catch (error) {
      console.error("Could not update alarm:", error);
      setAlarms((previous) => previous.map((item) => (item.id === alarm.id ? alarm : item)));
      await showAlert("Couldn't update alarm", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function handleDelete(alarm: AppAlarm) {
    const confirmed = await showConfirm(
      "Delete this alarm?",
      `The ${formatClock(alarm.hour, alarm.minute)} alarm will be removed. Your recording stays in your library.`,
      "Delete alarm",
      true,
    );
    if (!confirmed) return;
    try {
      await deleteAlarm(alarm);
      setAlarms((previous) => previous.filter((item) => item.id !== alarm.id));
      showToast("Alarm deleted.");
    } catch (error) {
      console.error("Could not delete alarm:", error);
      await showAlert("Couldn't delete alarm", "Please try again.");
    }
  }

  /** Delete from inside the sheet: close it first so the confirm dialog isn't hidden behind it. */
  async function handleDeleteFromEditor(alarm: AppAlarm) {
    setEditor(null);
    await wait(380);
    await handleDelete(alarm);
  }

  async function handleRecordNew() {
    setEditor(null);
    await wait(380);
    openRecordModal();
  }

  async function handlePermissionSetup() {
    try {
      await requestAlarmPermissions();
      await reload();
      await showAlert(
        "Permissions checked",
        "If notifications are still off, turn them on in Settings, Apps, VoiceNest, Notifications. On Android 14 and up, full-screen alarms may need a separate setting.",
      );
    } catch (error) {
      await showAlert("Couldn't open settings", error instanceof Error ? error.message : "Please open settings manually.");
    }
  }

  function permissionMessage() {
    if (!permissionState) return "";
    if (!permissionState.notifications) return "Notifications are off, so alarms may stay silent. Tap to turn them on.";
    if (permissionState.status === "unavailable") return "Native alarms aren't available here. Notifications will be used instead.";
    if (!permissionState.exactAlarm) return "Exact alarm access is off, so alarms may arrive a little late.";
    return "Full-screen alarm access is off, so the alarm may not take over your lock screen.";
  }

  function linkedRecording(alarm: AppAlarm) {
    return alarm.recordingId ? (recordings.find((r) => r.id === alarm.recordingId) ?? null) : null;
  }

  /* ── render ── */

  const nextParts = next ? clockParts(next.alarm.hour, next.alarm.minute) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageWidth}>
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Alarms</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setEditor({ mode: "create" })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="New alarm"
            >
              <Ionicons name="add" size={24} color={colors.textInverse} />
            </TouchableOpacity>
          </View>

          {/* Next alarm */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name={next ? "alarm" : "moon-outline"} size={22} color={colors.primary} />
            </View>
            {next && nextParts ? (
              <View style={styles.flexFill}>
                <Text style={styles.heroLead}>Next alarm in {formatUntil(next.date.getTime() - now)}</Text>
                <Text style={styles.heroDetail} numberOfLines={1}>
                  {nextParts.time} {nextParts.period}, {linkedRecording(next.alarm)?.title ?? next.alarm.title}
                </Text>
              </View>
            ) : (
              <View style={styles.flexFill}>
                <Text style={styles.heroLead}>No alarms are on</Text>
                <Text style={styles.heroDetail}>Rest easy, or set one for tomorrow.</Text>
              </View>
            )}
          </View>

          {permissionState && needsPermissionAttention ? (
            <TouchableOpacity
              style={styles.permissionCard}
              onPress={() => void handlePermissionSetup()}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.tealStrong} />
              <Text style={styles.permissionText}>{permissionMessage()}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}

          {/* List */}
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.tealStrong} />
            </View>
          ) : alarms.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="alarm-outline" size={26} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>Wake up to your own voice</Text>
              <Text style={styles.emptyText}>
                Pick one of your recordings and a time. It plays when the alarm goes off.
              </Text>
              <TouchableOpacity
                style={styles.primaryPill}
                onPress={() => setEditor({ mode: "create" })}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color={colors.textInverse} />
                <Text style={styles.primaryPillText}>Create your first alarm</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.listGap}>
              {alarms.map((alarm) => {
                const linked = linkedRecording(alarm);
                const parts = clockParts(alarm.hour, alarm.minute);
                const playingThis = linked ? currentPlayingId === linked.id && isPlaying : false;
                const limited = alarm.enabled && alarm.delivery !== "native";
                return (
                  <Pressable
                    key={alarm.id}
                    style={({ pressed }) => [
                      styles.alarmCard,
                      !alarm.enabled && styles.alarmCardOff,
                      pressed && styles.alarmCardPressed,
                    ]}
                    onPress={() => setEditor({ mode: "edit", alarm })}
                    onLongPress={() => void handleDelete(alarm)}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatClock(alarm.hour, alarm.minute)} alarm, ${formatAlarmDays(alarm.weekdays)}. Tap to edit, hold to delete.`}
                  >
                    <View style={styles.alarmTopRow}>
                      <View style={styles.flexFill}>
                        <View style={styles.timeLine}>
                          <Text style={[styles.alarmTime, !alarm.enabled && styles.mutedText]}>{parts.time}</Text>
                          <Text style={[styles.alarmPeriod, !alarm.enabled && styles.mutedText]}>{parts.period}</Text>
                        </View>
                        <Text style={styles.alarmRepeat}>{formatAlarmDays(alarm.weekdays)}</Text>
                      </View>
                      <Switch
                        value={alarm.enabled}
                        onValueChange={(value) => void handleToggle(alarm, value)}
                        trackColor={{ false: colors.borderStrong, true: colors.tealStrong }}
                        thumbColor={alarm.enabled ? colors.backgroundElevated : colors.backgroundSubtle}
                        accessibilityLabel={`${alarm.enabled ? "Turn off" : "Turn on"} ${formatClock(alarm.hour, alarm.minute)} alarm`}
                      />
                    </View>

                    <View style={styles.linkedRow}>
                      {linked ? (
                        <>
                          <View style={[styles.thumbSmall, { backgroundColor: colors[linked.surface] }]}>
                            <Ionicons name={linked.icon as any} size={15} color={colors.primary} />
                          </View>
                          <Text style={styles.linkedTitle} numberOfLines={1}>{linked.title}</Text>
                          <TouchableOpacity
                            style={[styles.playButton, playingThis && { backgroundColor: colors.primary }]}
                            onPress={() => playRecording(linked.id, linked.uri)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${linked.title}`}
                          >
                            <Ionicons
                              name={playingThis ? "pause" : "play"}
                              size={13}
                              color={playingThis ? colors.textInverse : colors.primary}
                            />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Ionicons name="alert-circle-outline" size={16} color={colors.accentWarm} />
                          <Text style={styles.linkedMissing}>
                            {alarm.recordingId
                              ? "This recording was deleted. Tap to choose another."
                              : "No recording yet. Tap to choose one."}
                          </Text>
                        </>
                      )}
                    </View>

                    {SETTINGS_SUPPORTED ? (
                      <Text style={styles.settingsLine}>{describeSettings(alarm.settings)}</Text>
                    ) : null}

                    {limited ? (
                      <View style={styles.limitedRow}>
                        <Ionicons name="notifications-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.limitedText}>
                          {alarm.delivery === "native-no-full-screen"
                            ? "Limited lock screen display"
                            : "Using a standard notification"}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {alarms.length > 0 ? (
            <Text style={styles.footerNote}>Tap an alarm to edit it. Hold to delete.</Text>
          ) : null}

          {/* Temporary: remove once alarms ring correctly */}
          <TouchableOpacity
            style={styles.logButton}
            onPress={async () => showAlert("Alarm log", await readAlarmLog())}
            onLongPress={() => void clearAlarmLog()}
            activeOpacity={0.7}
          >
            <Text style={styles.logButtonText}>Show alarm log (hold to clear)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color={colors.textInverse} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {editor ? (
        <AlarmEditor
          key={editor.mode === "edit" ? editor.alarm.id : "new"}
          target={editor}
          onClose={() => setEditor(null)}
          onSubmit={handleSubmit}
          onDelete={(alarm) => void handleDeleteFromEditor(alarm)}
          onRecordNew={() => void handleRecordNew()}
          styles={styles}
          colors={colors}
        />
      ) : null}
      {dialog}
    </SafeAreaView>
  );
}

/* ───────────────────────── styles ───────────────────────── */

function makeStyles(colors: Theme, isDark: boolean) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const floatingShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;
  const sans = Fonts?.sans;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: Layout.screenHorizontal, paddingTop: Spacing.two, paddingBottom: Spacing.ten },
    pageWidth: { width: "100%", maxWidth: Layout.contentMaxWidth, alignSelf: "center" },
    flexFill: { flex: 1, minWidth: 0 },
    listGap: { gap: Spacing.three },
    mutedText: { color: colors.textTertiary },

    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.four },
    pageTitle: { ...Typography.display, fontFamily: Fonts?.serif, fontSize: 32, lineHeight: 38, color: colors.primary },
    addButton: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, ...cardShadow },

    hero: { flexDirection: "row", alignItems: "center", gap: Spacing.three, padding: Spacing.four, borderRadius: Radius.xl, backgroundColor: colors.surfaceYellow, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.four },
    heroIcon: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundElevated },
    heroLead: { ...Typography.title, fontFamily: sans, fontSize: 17, color: colors.textPrimary },
    heroDetail: { ...Typography.caption, fontFamily: sans, fontSize: 13, marginTop: 2, color: colors.textSecondary },

    permissionCard: { flexDirection: "row", alignItems: "center", gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.four },
    permissionText: { ...Typography.caption, fontFamily: sans, fontSize: 12, lineHeight: 17, color: colors.textSecondary, flex: 1 },

    alarmCard: { padding: Spacing.four, borderRadius: Radius.xl, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    alarmCardOff: { opacity: 0.7 },
    alarmCardPressed: { transform: [{ scale: 0.99 }] },
    alarmTopRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
    timeLine: { flexDirection: "row", alignItems: "baseline", gap: Spacing.one },
    alarmTime: { ...Typography.displayXL, fontFamily: Fonts?.serif, fontSize: 38, lineHeight: 44, color: colors.primary, fontVariant: ["tabular-nums"] },
    alarmPeriod: { ...Typography.label, fontFamily: sans, fontSize: 15, fontWeight: "700", color: colors.primary },
    alarmRepeat: { ...Typography.caption, fontFamily: sans, fontSize: 13, marginTop: 2, color: colors.textSecondary },
    linkedRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two, marginTop: Spacing.three, padding: Spacing.two, borderRadius: Radius.md, backgroundColor: colors.background },
    linkedTitle: { ...Typography.label, fontFamily: sans, fontSize: 13, color: colors.textPrimary, flex: 1 },
    linkedMissing: { ...Typography.caption, fontFamily: sans, fontSize: 12, color: colors.textSecondary, flex: 1 },
    limitedRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: Spacing.two },
    limitedText: { ...Typography.caption, fontFamily: sans, fontSize: 11, color: colors.textSecondary },

    thumbSmall: { width: 30, height: 30, borderRadius: Radius.xs, alignItems: "center", justifyContent: "center" },
    thumb: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: "center", justifyContent: "center" },
    thumbLarge: { width: 52, height: 52, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
    playButton: { width: 32, height: 32, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundSubtle, borderWidth: 1, borderColor: colors.border },

    loadingState: { minHeight: 120, alignItems: "center", justifyContent: "center" },
    emptyCard: { alignItems: "center", paddingHorizontal: Spacing.five, paddingVertical: Spacing.seven, borderRadius: Radius.xl, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.backgroundElevated },
    emptyIcon: { width: 52, height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundSubtle, marginBottom: Spacing.three },
    emptyTitle: { ...Typography.title, fontFamily: sans, fontSize: 17, color: colors.textPrimary, textAlign: "center" },
    emptyText: { ...Typography.caption, fontFamily: sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: "center", marginTop: Spacing.two, marginBottom: Spacing.four },
    primaryPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two, minHeight: 46, paddingHorizontal: Spacing.five, borderRadius: Radius.pill, backgroundColor: colors.primary },
    primaryPillText: { ...Typography.label, fontFamily: sans, fontSize: 14, fontWeight: "700", color: colors.textInverse },

    footerNote: { ...Typography.caption, fontFamily: sans, fontSize: 12, textAlign: "center", color: colors.textTertiary, marginTop: Spacing.four },
    logButton: { padding: Spacing.three, alignItems: "center", marginTop: Spacing.five },
    logButtonText: { ...Typography.caption, fontFamily: sans, fontSize: 11, color: colors.textTertiary },

    toast: { position: "absolute", left: Spacing.five, right: Spacing.five, bottom: Spacing.five, alignSelf: "center", maxWidth: 420, flexDirection: "row", alignItems: "center", gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderRadius: Radius.pill, backgroundColor: colors.primary, ...floatingShadow },
    toastText: { ...Typography.label, fontFamily: sans, fontSize: 13, color: colors.textInverse, flexShrink: 1 },

    /* sheet */
    sheetRoot: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
    sheet: { width: "100%", maxWidth: Layout.contentMaxWidth, alignSelf: "center", maxHeight: "92%", backgroundColor: colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingTop: Spacing.two },
    grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: Spacing.two },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
    sheetTitle: { ...Typography.title, fontFamily: sans, fontSize: 18, color: colors.textPrimary },
    roundButton: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
    roundButtonSpacer: { width: 38 },
    sheetScroll: { flexGrow: 0 },
    sheetContent: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
    noRecordings: { alignItems: "center", padding: Spacing.six, gap: Spacing.three },

    recordingCard: { flexDirection: "row", alignItems: "center", gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    recordingCardTitle: { ...Typography.title, fontFamily: sans, fontSize: 16, color: colors.textPrimary },
    changeText: { ...Typography.label, fontFamily: sans, fontSize: 13, fontWeight: "700", color: colors.tealStrong },
    recordingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three, marginHorizontal: Spacing.four, padding: Spacing.two, paddingRight: Spacing.three, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
    recordingRowSelected: { borderColor: colors.primary },
    rowTitle: { ...Typography.label, fontFamily: sans, fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    rowMeta: { ...Typography.caption, fontFamily: sans, fontSize: 12, marginTop: 2, color: colors.textSecondary },

    sectionLabel: { ...Typography.label, fontFamily: sans, fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginTop: Spacing.five, marginBottom: Spacing.two },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionValue: { ...Typography.caption, fontFamily: sans, fontSize: 12, fontWeight: "700", color: colors.tealStrong, marginTop: Spacing.five, marginBottom: Spacing.two },
    hint: { ...Typography.caption, fontFamily: sans, fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: Spacing.two },

    timeCard: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.one, paddingVertical: Spacing.two, borderRadius: Radius.xl, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
    timeColumn: { width: 76, alignItems: "center" },
    stepButton: { width: 56, height: 36, alignItems: "center", justifyContent: "center", borderRadius: Radius.md },
    stepButtonPressed: { backgroundColor: colors.backgroundSubtle },
    timeDigit: { ...Typography.displayXL, fontFamily: Fonts?.serif, fontSize: 48, lineHeight: 56, color: colors.primary, fontVariant: ["tabular-nums"] },
    timeColon: { ...Typography.displayXL, fontFamily: Fonts?.serif, fontSize: 40, lineHeight: 48, color: colors.primary, marginBottom: 4 },
    periodStack: { gap: Spacing.one, marginLeft: Spacing.three },
    periodOption: { minWidth: 52, paddingVertical: Spacing.two, alignItems: "center", borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
    periodOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodText: { ...Typography.label, fontFamily: sans, fontSize: 13, fontWeight: "700", color: colors.textSecondary },
    periodTextActive: { color: colors.textInverse },

    presetRow: { gap: Spacing.two, paddingBottom: Spacing.three },
    preset: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: Radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
    presetActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetText: { ...Typography.label, fontFamily: sans, fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    presetTextActive: { color: colors.textInverse },
    daysRow: { flexDirection: "row", justifyContent: "space-between" },
    dayChip: { width: 42, height: 42, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
    dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayChipText: { ...Typography.label, fontFamily: sans, fontWeight: "700", color: colors.textSecondary },
    dayChipTextSelected: { color: colors.textInverse },

    optionRow: { flexDirection: "row", gap: Spacing.two },
    option: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.one, paddingVertical: Spacing.three, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
    optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionText: { ...Typography.label, fontFamily: sans, fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    optionTextActive: { color: colors.textInverse },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three, marginTop: Spacing.five, padding: Spacing.three, borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
    toggleTitle: { ...Typography.label, fontFamily: sans, fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    settingsLine: { ...Typography.caption, fontFamily: sans, fontSize: 11, color: colors.textTertiary, marginTop: Spacing.two },
    deleteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two, marginTop: Spacing.six, paddingVertical: Spacing.three },
    deleteText: { ...Typography.label, fontFamily: sans, fontSize: 14, fontWeight: "700", color: colors.accentWarm },

    footer: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
    errorRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.two, marginBottom: Spacing.two },
    errorText: { ...Typography.caption, fontFamily: sans, fontSize: 12, lineHeight: 17, color: colors.danger, flex: 1 },
    saveButton: { minHeight: 54, borderRadius: Radius.pill, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two },
    saveButtonText: { ...Typography.label, fontFamily: sans, fontSize: 15, fontWeight: "800", color: colors.textInverse },
    buttonDisabled: { opacity: 0.55 },
  });
}