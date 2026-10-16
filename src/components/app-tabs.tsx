import SharedAudioImportBridge from "@/components/import/shared-audio-import-bridge";
import AudioPlayerDock from "@/components/player/audio-player-dock";
import RecordScreen from "@/components/recording/inteface";
import { useAppTheme } from "@/constants/theme";
import {
  RecordingModalProvider,
  useRecordingModal,
} from "@/contexts/recording-modal-context";
import { RecordingsProvider } from "@/contexts/recordings-context";
import { useAlarmPlayback } from "@/hooks/use-alarm-playback";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Modal, Platform } from "react-native";

type TabConfig = {
  name: string;
  label: string;
  icon: { default: string; selected: string };
  sf: { default: string; selected: string };
};

const TABS: TabConfig[] = [
  {
    name: "index",
    label: "Home",
    icon: { default: "home-outline", selected: "home" },
    sf: { default: "house", selected: "house.fill" },
  },
  {
    name: "library/index",
    label: "Library",
    icon: { default: "book-open-outline", selected: "book-open-variant" },
    sf: { default: "waveform", selected: "waveform" },
  },
  {
    name: "schedule/index",
    label: "Schedule",
    icon: { default: "alarm", selected: "alarm" },
    sf: { default: "alarm", selected: "alarm.fill" },
  },
  {
    name: "settings",
    label: "Profile",
    icon: { default: "account-outline", selected: "account" },
    sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" },
  },
];

function TabsContent() {
  const colors = useAppTheme();
  const { isRecordModalOpen, closeRecordModal } = useRecordingModal();

  // Plays the linked recording when an alarm notification arrives or is tapped.
  // Must live under RecordingsProvider, which it does.
  useAlarmPlayback();

  const selectedColor = colors.primary;
  const unselectedColor = colors.textTertiary;

  const iosProps = {
    blurEffect: "systemChromeMaterial" as const,
    tintColor: selectedColor,
  };

  const androidProps = {
    backgroundColor: colors.backgroundElevated,
    disableIndicator: true,
    rippleColor: colors.overlay,
    labelVisibilityMode: "labeled" as const,
    iconColor: { default: unselectedColor, selected: selectedColor },
    labelStyle: {
      default: { color: unselectedColor, fontSize: 11, fontWeight: "500" as const },
      selected: { color: selectedColor, fontSize: 11, fontWeight: "700" as const },
    },
  };

  return (
    <>
      <SharedAudioImportBridge />

      <NativeTabs
        minimizeBehavior="never"
        disableTransparentOnScrollEdge
        {...(Platform.OS === "ios" ? iosProps : androidProps)}
      >
        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>

            <NativeTabs.Trigger.Icon
              sf={tab.sf as any}
              src={{
                default: (
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialCommunityIcons}
                    name={tab.icon.default as any}
                  />
                ),
                selected: (
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialCommunityIcons}
                    name={tab.icon.selected as any}
                  />
                ),
              }}
            />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      <AudioPlayerDock bottomOffset={80} />

      <Modal
        visible={isRecordModalOpen}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={closeRecordModal}
      >
        <RecordScreen onClose={closeRecordModal} />
      </Modal>
    </>
  );
}

export default function AppTabs() {
  return (
    <RecordingsProvider>
      <RecordingModalProvider>
        <TabsContent />
      </RecordingModalProvider>
    </RecordingsProvider>
  );
}