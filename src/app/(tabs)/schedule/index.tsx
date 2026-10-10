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
import {
  createAlarm,
  deleteAlarm,
  getAlarmPermissions,
  getAlarms,
  requestAlarmPermissions,
  setAlarmEnabled,
  type AlarmWeekday,
  type AppAlarm,
} from "@/lib/alarms/alarm-service";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DAY_OPTIONS: { id: AlarmWeekday; short: string; long: string }[] = [
  { id: 1, short: "M", long: "Mon" },
  { id: 2, short: "T", long: "Tue" },
  { id: 3, short: "W", long: "Wed" },
  { id: 4, short: "T", long: "Thu" },
  { id: 5, short: "F", long: "Fri" },
  { id: 6, short: "S", long: "Sat" },
  { id: 7, short: "S", long: "Sun" },
];

function formatClock(hour: number, minute: number) {
  const shownHour = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${shownHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatAlarmDays(weekdays: AlarmWeekday[]) {
  if (weekdays.length === 0) return "Once";
  if (weekdays.length === 7) return "Every day";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((day) => weekdays.includes(day as AlarmWeekday))) {
    return "Weekdays";
  }
  if (weekdays.length === 2 && [6, 7].every((day) => weekdays.includes(day as AlarmWeekday))) {
    return "Weekends";
  }
  return weekdays.map((day) => DAY_OPTIONS.find((option) => option.id === day)?.long).join(", ");
}

function adjustMinute(hour: number, minute: number, delta: number) {
  const total = ((hour * 60 + minute + delta) % (24 * 60) + 24 * 60) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export default function ScheduleScreen() {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const styles = makeStyles(colors, isDark);
  const { dialog, showAlert, showConfirm } = useAppDialog();

  const [alarms, setAlarms] = useState<AppAlarm[]>([]);
  const [title, setTitle] = useState("Morning reminder");
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(30);
  const [weekdays, setWeekdays] = useState<AlarmWeekday[]>([1, 2, 3, 4, 5]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [permissionState, setPermissionState] = useState<{
    nativeAvailable: boolean;
    exactAlarm: boolean;
    fullScreen: boolean;
    status: string;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [storedAlarms, permissions] = await Promise.all([
        getAlarms(),
        getAlarmPermissions(),
      ]);
      setAlarms(storedAlarms);
      if (permissions) {
        setPermissionState({
          nativeAvailable: permissions.status !== "unavailable",
          exactAlarm: permissions.canScheduleExactAlarms,
          fullScreen: permissions.canUseFullScreenIntent !== false,
          status: permissions.status,
        });
      } else {
        setPermissionState(null);
      }
    } catch (error) {
      console.error("Unable to load alarms:", error);
      void showAlert("Couldn't load alarms", "Your saved alarms could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeCount = useMemo(() => alarms.filter((alarm) => alarm.enabled).length, [alarms]);

  async function handleCreateAlarm() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await createAlarm({ title, hour, minute, weekdays });
      setAlarms((previous) => [result.alarm, ...previous].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
      if (result.notice) {
        await showAlert("Alarm scheduled", result.notice);
      } else {
        await showAlert("Alarm scheduled", `${result.alarm.title} is set for ${formatClock(hour, minute)}.`);
      }
    } catch (error) {
      console.error("Could not schedule alarm:", error);
      await showAlert(
        "Couldn't set alarm",
        error instanceof Error ? error.message : "The alarm could not be scheduled. Check the required permissions and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(alarm: AppAlarm, nextEnabled: boolean) {
    try {
      const updated = await setAlarmEnabled(alarm, nextEnabled);
      setAlarms((previous) => previous.map((item) => item.id === alarm.id ? updated : item));
      if (nextEnabled && updated.delivery !== "native") {
        await showAlert(
          "Notification fallback",
          updated.delivery === "native-no-full-screen"
            ? "The alarm is enabled, but Android full-screen alarm access is disabled."
            : "This alarm uses a standard local notification instead of a continuous native alarm.",
        );
      }
    } catch (error) {
      console.error("Could not update alarm:", error);
      await showAlert("Alarm update failed", error instanceof Error ? error.message : "The alarm could not be updated.");
    }
  }

  async function handleDelete(alarm: AppAlarm) {
    const confirmed = await showConfirm(
      "Delete alarm?",
      `“${alarm.title}” will be removed from this device.`,
      "Delete alarm",
      true,
    );
    if (!confirmed) return;

    try {
      await deleteAlarm(alarm);
      setAlarms((previous) => previous.filter((item) => item.id !== alarm.id));
    } catch (error) {
      console.error("Could not delete alarm:", error);
      await showAlert("Delete failed", "The alarm could not be deleted.");
    }
  }

  async function handlePermissionSetup() {
    try {
      await requestAlarmPermissions();
      await reload();
      await showAlert(
        "Permissions checked",
        "The native alarm permissions have been checked. On Android 14+, full-screen alarms may require a separate setting.",
      );
    } catch (error) {
      await showAlert("Permission setup failed", error instanceof Error ? error.message : "Unable to open alarm settings.");
    }
  }

  function toggleDay(day: AlarmWeekday) {
    setWeekdays((previous) => previous.includes(day)
      ? previous.filter((item) => item !== day)
      : [...previous, day].sort((a, b) => a - b));
  }

  const time = formatClock(hour, minute);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageWidth}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>YOUR ROUTINE</Text>
              <Text style={styles.pageTitle}>Alarms</Text>
              <Text style={styles.subtitle}>{activeCount} active {activeCount === 1 ? "alarm" : "alarms"}</Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="alarm-outline" size={25} color={colors.primary} />
            </View>
          </View>

          {permissionState && (permissionState.status === "unavailable" || !permissionState.exactAlarm || !permissionState.fullScreen) ? (
            <TouchableOpacity style={styles.permissionCard} onPress={() => void handlePermissionSetup()} activeOpacity={0.8}>
              <View style={styles.permissionIcon}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.tealStrong} />
              </View>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>Check alarm permissions</Text>
                <Text style={styles.permissionText}>
                  {permissionState.status === "unavailable"
                    ? "Native alarms are unavailable on this OS version. Scheduled notifications may be used instead."
                    : !permissionState.exactAlarm
                      ? "Exact-alarm access is not granted. Alarms may fall back to standard notifications."
                      : "Android full-screen alarm access is disabled. The alarm may not take over the lock screen."}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.formCard}>
            <View style={styles.formHeading}>
              <View>
                <Text style={styles.formTitle}>New alarm</Text>
                <Text style={styles.formSubtitle}>It can ring while the app is closed.</Text>
              </View>
              <View style={styles.formHeadingIcon}>
                <Ionicons name="add-circle-outline" size={22} color={colors.tealStrong} />
              </View>
            </View>

            <View style={styles.timePicker}>
              <View style={styles.timeColumn}>
                <TouchableOpacity
                  accessibilityLabel="Increase hour"
                  style={styles.timeAdjust}
                  onPress={() => setHour((previous) => (previous + 1) % 24)}
                >
                  <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.timeDigit}>{String(hour % 12 || 12).padStart(2, "0")}</Text>
                <TouchableOpacity
                  accessibilityLabel="Decrease hour"
                  style={styles.timeAdjust}
                  onPress={() => setHour((previous) => (previous + 23) % 24)}
                >
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.timeColon}>:</Text>
              <View style={styles.timeColumn}>
                <TouchableOpacity
                  accessibilityLabel="Increase minute"
                  style={styles.timeAdjust}
                  onPress={() => {
                    const next = adjustMinute(hour, minute, 1);
                    setHour(next.hour);
                    setMinute(next.minute);
                  }}
                >
                  <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.timeDigit}>{String(minute).padStart(2, "0")}</Text>
                <TouchableOpacity
                  accessibilityLabel="Decrease minute"
                  style={styles.timeAdjust}
                  onPress={() => {
                    const next = adjustMinute(hour, minute, -1);
                    setHour(next.hour);
                    setMinute(next.minute);
                  }}
                >
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.periodStack}>
                <TouchableOpacity
                  style={[styles.periodOption, hour < 12 && styles.periodOptionActive]}
                  onPress={() => setHour((previous) => previous % 12)}
                >
                  <Text style={[styles.periodText, hour < 12 && styles.periodTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodOption, hour >= 12 && styles.periodOptionActive]}
                  onPress={() => setHour((previous) => (previous % 12) + 12)}
                >
                  <Text style={[styles.periodText, hour >= 12 && styles.periodTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.timeCaption}>Alarm time · {time}</Text>

            <Text style={styles.fieldLabel}>ALARM NAME</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Morning reflection"
              placeholderTextColor={colors.textTertiary}
              maxLength={60}
              returnKeyType="done"
              style={styles.titleInput}
            />

            <View style={styles.repeatHeader}>
              <Text style={styles.fieldLabel}>REPEAT</Text>
              <Text style={styles.repeatValue}>{formatAlarmDays(weekdays)}</Text>
            </View>
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
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>{day.short}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              Select no days for a one-time alarm, or choose the days it should repeat.
            </Text>

            <TouchableOpacity
              style={[styles.setAlarmButton, isSaving && styles.buttonDisabled]}
              onPress={() => void handleCreateAlarm()}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? <ActivityIndicator color={colors.textInverse} /> : <Ionicons name="alarm" size={19} color={colors.textInverse} />}
              <Text style={styles.setAlarmButtonText}>{isSaving ? "Setting alarm..." : "Set alarm"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listHeading}>
            <Text style={styles.listTitle}>Your alarms</Text>
            <Text style={styles.listCount}>{alarms.length}</Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.tealStrong} />
              <Text style={styles.emptyText}>Loading your alarms...</Text>
            </View>
          ) : alarms.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="alarm-outline" size={24} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No alarms yet</Text>
              <Text style={styles.emptyText}>Create an alarm above. Native alarms are designed to work when the app is closed.</Text>
            </View>
          ) : (
            <View style={styles.alarmList}>
              {alarms.map((alarm) => (
                <View key={alarm.id} style={[styles.alarmCard, !alarm.enabled && styles.alarmCardDisabled]}>
                  <View style={styles.alarmTopRow}>
                    <View style={styles.alarmCopy}>
                      <Text style={[styles.alarmTime, !alarm.enabled && styles.disabledText]}>{formatClock(alarm.hour, alarm.minute)}</Text>
                      <Text style={styles.alarmTitle} numberOfLines={1}>{alarm.title}</Text>
                      <Text style={styles.alarmRepeat}>{formatAlarmDays(alarm.weekdays)}</Text>
                    </View>
                    <Switch
                      value={alarm.enabled}
                      onValueChange={(next) => void handleToggle(alarm, next)}
                      trackColor={{ false: colors.borderStrong, true: colors.tealStrong }}
                      thumbColor={alarm.enabled ? colors.backgroundElevated : colors.backgroundSubtle}
                      accessibilityLabel={`Toggle ${alarm.title}`}
                    />
                  </View>
                  <View style={styles.alarmBottomRow}>
                    <View style={styles.deliveryTag}>
                      <Ionicons
                        name={alarm.delivery === "native" ? "shield-checkmark-outline" : "notifications-outline"}
                        size={13}
                        color={alarm.delivery === "native" ? colors.tealStrong : colors.textSecondary}
                      />
                      <Text style={styles.deliveryTagText}>
                        {alarm.delivery === "native" ? "Native alarm" : alarm.delivery === "native-no-full-screen" ? "Alarm · limited lock screen" : "Notification fallback"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => void handleDelete(alarm)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${alarm.title}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.accentWarm} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.footerNote}>
            <Ionicons name="information-circle-outline" size={17} color={colors.textTertiary} />
            <Text style={styles.footerNoteText}>
              Native alarms use the operating system's alarm service. Notification fallback alarms can sound with the app closed, but may not ring continuously or display a full-screen alarm. Test alarms on a physical device before relying on them.
            </Text>
          </View>
        </View>
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

function makeStyles(colors: Theme, isDark: boolean) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: Layout.screenHorizontal, paddingTop: Spacing.two, paddingBottom: Spacing.eight },
    pageWidth: { width: "100%", maxWidth: Layout.contentMaxWidth, alignSelf: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.five },
    eyebrow: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: colors.tealStrong, marginBottom: Spacing.one },
    pageTitle: { ...Typography.display, fontFamily: Fonts?.serif, fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.primary },
    subtitle: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 13, marginTop: Spacing.half, color: colors.textSecondary },
    headerIcon: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceYellow, borderWidth: 1, borderColor: colors.border },
    permissionCard: { flexDirection: "row", alignItems: "center", gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.four, ...cardShadow },
    permissionIcon: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: colors.surfaceSage, alignItems: "center", justifyContent: "center" },
    permissionCopy: { flex: 1, minWidth: 0 },
    permissionTitle: { ...Typography.label, fontFamily: Fonts?.sans, fontWeight: "800", color: colors.textPrimary },
    permissionText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginTop: 3 },
    formCard: { padding: Spacing.four, borderRadius: Radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, marginBottom: Spacing.six, ...cardShadow },
    formHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.three },
    formTitle: { ...Typography.headline, fontFamily: Fonts?.sans, fontSize: 17, fontWeight: "800", color: colors.textPrimary },
    formSubtitle: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 12, color: colors.textSecondary, marginTop: 3 },
    formHeadingIcon: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: colors.surfaceSage, alignItems: "center", justifyContent: "center" },
    timePicker: { minHeight: 150, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two, borderRadius: Radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingVertical: Spacing.two },
    timeColumn: { width: 76, alignItems: "center", justifyContent: "center" },
    timeAdjust: { width: 54, height: 30, alignItems: "center", justifyContent: "center", borderRadius: Radius.md },
    timeDigit: { ...Typography.displayXL, fontFamily: Fonts?.mono, fontSize: 43, lineHeight: 52, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
    timeColon: { ...Typography.displayXL, fontFamily: Fonts?.mono, fontSize: 38, lineHeight: 44, color: colors.primary, marginBottom: 2 },
    periodStack: { gap: Spacing.one, marginLeft: Spacing.two },
    periodOption: { minWidth: 46, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, alignItems: "center", borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
    periodOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 12, fontWeight: "800", color: colors.textSecondary },
    periodTextActive: { color: colors.textInverse },
    timeCaption: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 11, textAlign: "center", marginTop: Spacing.two, marginBottom: Spacing.four, color: colors.textSecondary },
    fieldLabel: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: colors.textSecondary },
    titleInput: { height: 48, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.background, color: colors.textPrimary, fontFamily: Fonts?.sans, fontSize: 14, marginTop: Spacing.two, marginBottom: Spacing.four },
    repeatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.two },
    repeatValue: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 11, fontWeight: "700", color: colors.tealStrong },
    daysRow: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.one },
    dayChip: { width: 36, height: 38, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayChipText: { ...Typography.label, fontFamily: Fonts?.sans, fontWeight: "700", color: colors.textSecondary },
    dayChipTextSelected: { color: colors.textInverse },
    helperText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 11, lineHeight: 16, color: colors.textTertiary, marginTop: Spacing.two },
    setAlarmButton: { minHeight: 50, borderRadius: Radius.pill, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.two, marginTop: Spacing.four },
    setAlarmButtonText: { ...Typography.label, fontFamily: Fonts?.sans, fontSize: 14, fontWeight: "800", color: colors.textInverse },
    buttonDisabled: { opacity: 0.65 },
    listHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.two, marginBottom: Spacing.three },
    listTitle: { ...Typography.headline, fontFamily: Fonts?.serif, fontSize: 21, color: colors.textPrimary },
    listCount: { ...Typography.caption, fontFamily: Fonts?.sans, fontWeight: "800", color: colors.tealStrong, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceSage, borderRadius: Radius.pill, overflow: "hidden" },
    alarmList: { gap: Spacing.three },
    alarmCard: { padding: Spacing.four, borderRadius: Radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, ...cardShadow },
    alarmCardDisabled: { opacity: 0.72 },
    alarmTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.three },
    alarmCopy: { flex: 1, minWidth: 0 },
    alarmTime: { ...Typography.display, fontFamily: Fonts?.mono, fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
    disabledText: { color: colors.textTertiary },
    alarmTitle: { ...Typography.bodyMedium, fontFamily: Fonts?.sans, fontSize: 13, fontWeight: "800", color: colors.textPrimary, marginTop: 3 },
    alarmRepeat: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 11, color: colors.textSecondary, marginTop: 3 },
    alarmBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    deliveryTag: { flexDirection: "row", alignItems: "center", gap: 5 },
    deliveryTagText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 10, fontWeight: "700", color: colors.textSecondary },
    deleteButton: { width: 34, height: 34, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    loadingState: { minHeight: 100, alignItems: "center", justifyContent: "center", gap: Spacing.two },
    emptyCard: { alignItems: "center", paddingHorizontal: Spacing.five, paddingVertical: Spacing.six, borderRadius: Radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.backgroundElevated },
    emptyIcon: { width: 48, height: 48, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundSubtle, marginBottom: Spacing.three },
    emptyTitle: { ...Typography.label, fontFamily: Fonts?.sans, fontSize: 14, fontWeight: "800", color: colors.textPrimary },
    emptyText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: "center", marginTop: Spacing.two },
    footerNote: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.two, marginTop: Spacing.five, paddingHorizontal: Spacing.one },
    footerNoteText: { ...Typography.caption, fontFamily: Fonts?.sans, fontSize: 10, lineHeight: 16, color: colors.textTertiary, flex: 1 },
  });
}
