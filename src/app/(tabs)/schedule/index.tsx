import AlarmEditor, {
  clockParts,
  formatAlarmDays,
  formatClock,
  formatUntil,
  getNextFire,
  type EditorTarget,
  type EditorValues,
} from "@/components/alarms/alarm-editor";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Fonts,
  Radius,
  Shadows,
  Spacing,
  Typography,
  useAppTheme,
  useResponsiveLayout,
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
  updateAlarm,
  type AppAlarm,
  type CreateAlarmInput,
} from "@/lib/alarms/alarm-service";
import {
  SETTINGS_SUPPORTED,
  describeSettings,
} from "@/lib/alarms/alarm-settings";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const byTime = (a: AppAlarm, b: AppAlarm) =>
  a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

export default function ScheduleScreen() {
  const colors = useAppTheme();
  const isDark = useColorScheme() === "dark";
  const responsive = useResponsiveLayout();
  const styles = useMemo(
    () => makeStyles(colors, isDark, responsive),
    [
      colors,
      isDark,
      responsive.width,
      responsive.height,
      responsive.horizontalPadding,
      responsive.contentMaxWidth,
      responsive.isCompact,
      responsive.isTablet,
    ],
  );
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

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
      void showAlertRef.current(
        "Couldn't load alarms",
        "Your saved alarms could not be loaded.",
      );
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

  const handleSubmit = useCallback(
    async (values: EditorValues, target: EditorTarget): Promise<string | null> => {
      const recording = recordings.find((r) => r.id === values.recordingId);
      if (!recording) {
        return "That recording is no longer available. Choose another one.";
      }

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
          [
            result.alarm,
            ...previous.filter((item) => item.id !== result.alarm.id),
          ].sort(byTime),
        );
        setEditor(null);
        void loadPermissions().catch(() => undefined);

        const fire = getNextFire(result.alarm, Date.now());
        const summary = fire
          ? `Alarm set. Rings in ${formatUntil(fire.getTime() - Date.now())}.`
          : "Alarm saved.";

        if (result.notice) {
          void wait(380).then(() =>
            showAlertRef.current("Alarm saved", result.notice as string),
          );
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
    setAlarms((previous) =>
      previous.map((item) =>
        item.id === alarm.id ? { ...item, enabled: nextEnabled } : item,
      ),
    );
    try {
      const updated = await setAlarmEnabled(alarm, nextEnabled);
      setAlarms((previous) =>
        previous.map((item) => (item.id === alarm.id ? updated : item)),
      );
      if (nextEnabled) {
        const fire = getNextFire(updated, Date.now());
        if (fire) {
          showToast(`Rings in ${formatUntil(fire.getTime() - Date.now())}.`);
        }
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
      setAlarms((previous) =>
        previous.map((item) => (item.id === alarm.id ? alarm : item)),
      );
      await showAlert(
        "Couldn't update alarm",
        error instanceof Error ? error.message : "Please try again.",
      );
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
      await showAlert(
        "Couldn't open settings",
        error instanceof Error
          ? error.message
          : "Please open settings manually.",
      );
    }
  }

  function permissionMessage() {
    if (!permissionState) return "";
    if (!permissionState.notifications) {
      return "Notifications are off, so alarms may stay silent. Tap to turn them on.";
    }
    if (permissionState.status === "unavailable") {
      return "Native alarms aren't available here. Notifications will be used instead.";
    }
    if (!permissionState.exactAlarm) {
      return "Exact alarm access is off, so alarms may arrive a little late.";
    }
    return "Full-screen alarm access is off, so the alarm may not take over your lock screen.";
  }

  function linkedRecording(alarm: AppAlarm) {
    return alarm.recordingId
      ? (recordings.find((r) => r.id === alarm.recordingId) ?? null)
      : null;
  }

  const nextParts = next ? clockParts(next.alarm.hour, next.alarm.minute) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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

          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons
                name={next ? "alarm" : "moon-outline"}
                size={22}
                color={colors.primary}
              />
            </View>
            {next && nextParts ? (
              <View style={styles.flexFill}>
                <Text style={styles.heroLead}>
                  Next alarm in {formatUntil(next.date.getTime() - now)}
                </Text>
                <Text style={styles.heroDetail} numberOfLines={1}>
                  {nextParts.time} {nextParts.period},{" "}
                  {linkedRecording(next.alarm)?.title ?? next.alarm.title}
                </Text>
              </View>
            ) : (
              <View style={styles.flexFill}>
                <Text style={styles.heroLead}>No alarms are on</Text>
                <Text style={styles.heroDetail}>
                  Rest easy, or set one for tomorrow.
                </Text>
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
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={colors.tealStrong}
              />
              <Text style={styles.permissionText}>{permissionMessage()}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.tealStrong} />
            </View>
          ) : alarms.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="alarm-outline"
                  size={26}
                  color={colors.textSecondary}
                />
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
                const playingThis = linked
                  ? currentPlayingId === linked.id && isPlaying
                  : false;
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
                          <Text
                            style={[
                              styles.alarmTime,
                              !alarm.enabled && styles.mutedText,
                            ]}
                          >
                            {parts.time}
                          </Text>
                          <Text
                            style={[
                              styles.alarmPeriod,
                              !alarm.enabled && styles.mutedText,
                            ]}
                          >
                            {parts.period}
                          </Text>
                        </View>
                        <Text style={styles.alarmRepeat}>
                          {formatAlarmDays(alarm.weekdays)}
                        </Text>
                      </View>
                      <Switch
                        value={alarm.enabled}
                        onValueChange={(value) => void handleToggle(alarm, value)}
                        trackColor={{
                          false: colors.borderStrong,
                          true: colors.tealStrong,
                        }}
                        thumbColor={
                          alarm.enabled
                            ? colors.backgroundElevated
                            : colors.backgroundSubtle
                        }
                        accessibilityLabel={`${alarm.enabled ? "Turn off" : "Turn on"} ${formatClock(alarm.hour, alarm.minute)} alarm`}
                      />
                    </View>

                    <View style={styles.linkedRow}>
                      {linked ? (
                        <>
                          <View
                            style={[
                              styles.thumbSmall,
                              { backgroundColor: colors[linked.surface] },
                            ]}
                          >
                            <Ionicons
                              name={linked.icon as any}
                              size={15}
                              color={colors.primary}
                            />
                          </View>
                          <Text style={styles.linkedTitle} numberOfLines={1}>
                            {linked.title}
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.playButton,
                              playingThis && { backgroundColor: colors.primary },
                            ]}
                            onPress={() => playRecording(linked.id, linked.uri)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${linked.title}`}
                          >
                            <Ionicons
                              name={playingThis ? "pause" : "play"}
                              size={13}
                              color={
                                playingThis ? colors.textInverse : colors.primary
                              }
                            />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Ionicons
                            name="alert-circle-outline"
                            size={16}
                            color={colors.accentWarm}
                          />
                          <Text style={styles.linkedMissing}>
                            {alarm.recordingId
                              ? "This recording was deleted. Tap to choose another."
                              : "No recording yet. Tap to choose one."}
                          </Text>
                        </>
                      )}
                    </View>

                    {SETTINGS_SUPPORTED ? (
                      <Text style={styles.settingsLine}>
                        {describeSettings(alarm.settings)}
                      </Text>
                    ) : null}

                    {limited ? (
                      <View style={styles.limitedRow}>
                        <Ionicons
                          name="notifications-outline"
                          size={13}
                          color={colors.textSecondary}
                        />
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
            <Text style={styles.footerNote}>
              Tap an alarm to edit it. Hold to delete.
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.logButton}
            onPress={async () => showAlert("Alarm log", await readAlarmLog())}
            onLongPress={() => void clearAlarmLog()}
            activeOpacity={0.7}
          >
            <Text style={styles.logButtonText}>
              Show alarm log (hold to clear)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {toast ? (
        <View
          style={styles.toast}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={colors.textInverse}
          />
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
        />
      ) : null}
      {dialog}
    </SafeAreaView>
  );
}

function makeStyles(
  colors: Theme,
  isDark: boolean,
  responsive: ReturnType<typeof useResponsiveLayout>,
) {
  const cardShadow = isDark ? Shadows.dark.card : Shadows.light.card;
  const floatingShadow = isDark ? Shadows.dark.floating : Shadows.light.floating;
  const sans = Fonts?.sans;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: responsive.horizontalPadding,
      paddingTop: Spacing.two,
      paddingBottom: Spacing.ten,
    },
    pageWidth: {
      width: "100%",
      maxWidth: responsive.contentMaxWidth,
      alignSelf: "center",
    },
    flexFill: { flex: 1, minWidth: 0 },
    listGap: { gap: Spacing.three },
    mutedText: { color: colors.textTertiary },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.four,
    },
    pageTitle: {
      ...Typography.display,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 27 : responsive.isTablet ? 36 : 32,
      lineHeight: responsive.isCompact ? 33 : responsive.isTablet ? 42 : 38,
      color: colors.primary,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      ...cardShadow,
    },

    hero: {
      flexDirection: responsive.isCompact ? "column" : "row",
      alignItems: responsive.isCompact ? "flex-start" : "center",
      gap: Spacing.three,
      padding: responsive.isCompact ? Spacing.three : Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.surfaceYellow,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.four,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundElevated,
    },
    heroLead: {
      ...Typography.title,
      fontFamily: sans,
      fontSize: 17,
      color: colors.textPrimary,
    },
    heroDetail: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 13,
      marginTop: 2,
      color: colors.textSecondary,
    },

    permissionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: Radius.lg,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.four,
    },
    permissionText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
      flex: 1,
    },

    alarmCard: {
      padding: responsive.isCompact ? Spacing.three : Spacing.four,
      borderRadius: Radius.xl,
      backgroundColor: colors.backgroundElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardShadow,
    },
    alarmCardOff: { opacity: 0.7 },
    alarmCardPressed: { transform: [{ scale: 0.99 }] },
    alarmTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    timeLine: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: Spacing.one,
    },
    alarmTime: {
      ...Typography.displayXL,
      fontFamily: Fonts?.serif,
      fontSize: responsive.isCompact ? 32 : responsive.isTablet ? 42 : 38,
      lineHeight: responsive.isCompact ? 38 : responsive.isTablet ? 48 : 44,
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    alarmPeriod: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 15,
      fontWeight: "700",
      color: colors.primary,
    },
    alarmRepeat: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 13,
      marginTop: 2,
      color: colors.textSecondary,
    },
    linkedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      marginTop: Spacing.three,
      padding: Spacing.two,
      borderRadius: Radius.md,
      backgroundColor: colors.background,
    },
    linkedTitle: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 13,
      color: colors.textPrimary,
      flex: 1,
    },
    linkedMissing: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      color: colors.textSecondary,
      flex: 1,
    },
    settingsLine: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: Spacing.two,
    },
    limitedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: Spacing.two,
    },
    limitedText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      color: colors.textSecondary,
    },

    thumbSmall: {
      width: 30,
      height: 30,
      borderRadius: Radius.xs,
      alignItems: "center",
      justifyContent: "center",
    },
    playButton: {
      width: 32,
      height: 32,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
      borderWidth: 1,
      borderColor: colors.border,
    },

    loadingState: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCard: {
      alignItems: "center",
      paddingHorizontal: Spacing.five,
      paddingVertical: Spacing.seven,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      backgroundColor: colors.backgroundElevated,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: Radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.backgroundSubtle,
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

    footerNote: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 12,
      textAlign: "center",
      color: colors.textTertiary,
      marginTop: Spacing.four,
    },
    logButton: {
      padding: Spacing.three,
      alignItems: "center",
      marginTop: Spacing.five,
    },
    logButtonText: {
      ...Typography.caption,
      fontFamily: sans,
      fontSize: 11,
      color: colors.textTertiary,
    },

    toast: {
      position: "absolute",
      left: Spacing.five,
      right: Spacing.five,
      bottom: Spacing.five,
      alignSelf: "center",
      maxWidth: 420,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      paddingHorizontal: Spacing.four,
      paddingVertical: Spacing.three,
      borderRadius: Radius.pill,
      backgroundColor: colors.primary,
      ...floatingShadow,
    },
    toastText: {
      ...Typography.label,
      fontFamily: sans,
      fontSize: 13,
      color: colors.textInverse,
      flexShrink: 1,
    },
  });
}