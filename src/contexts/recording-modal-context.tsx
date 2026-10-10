import { createContext, useContext, useState, type ReactNode } from "react";

type RecordingModalContextType = {
  isRecordModalOpen: boolean;
  openRecordModal: () => void;
  closeRecordModal: () => void;
};

const RecordingModalContext = createContext<RecordingModalContextType | undefined>(undefined);

export function RecordingModalProvider({ children }: { children: ReactNode }) {
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  return (
    <RecordingModalContext.Provider
      value={{
        isRecordModalOpen,
        openRecordModal: () => setIsRecordModalOpen(true),
        closeRecordModal: () => setIsRecordModalOpen(false),
      }}
    >
      {children}
    </RecordingModalContext.Provider>
  );
}

export function useRecordingModal() {
  const context = useContext(RecordingModalContext);
  if (!context) {
    throw new Error("useRecordingModal must be used within a RecordingModalProvider");
  }
  return context;
}