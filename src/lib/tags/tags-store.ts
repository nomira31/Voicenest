import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";

export const DEFAULT_TAGS = [
  "Motivation",
  "Affirmation",
  "Morning",
  "Reminder",
  "Journal",
  "Family",
  "Gratitude",
  "Idea",
];

const TAGS_FILE = new File(Paths.document, "voicenest-tags.json");

let memoryTags: string[] | null = null;
const listeners = new Set<(tags: string[]) => void>();

function notify(tags: string[]) {
  memoryTags = tags;
  listeners.forEach((listener) => listener(tags));
}

export function loadAvailableTags(): string[] {
  if (memoryTags) return memoryTags;
  try {
    if (TAGS_FILE.exists) {
      const raw = TAGS_FILE.textSync();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        memoryTags = parsed;
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Could not read saved tags, using defaults:", error);
  }
  memoryTags = [...DEFAULT_TAGS];
  return memoryTags;
}

function persistTags(nextTags: string[]) {
  try {
    if (!TAGS_FILE.exists) {
      TAGS_FILE.create({ intermediates: true, overwrite: true });
    }
    TAGS_FILE.write(JSON.stringify(nextTags));
  } catch (error) {
    console.warn("Could not persist tags:", error);
  }
  notify(nextTags);
}

export function addAvailableTag(rawTag: string): string[] {
  const cleaned = rawTag.trim().replace(/\s+/g, " ");
  if (!cleaned) return loadAvailableTags();

  const current = loadAvailableTags();
  const exists = current.some((tag) => tag.toLowerCase() === cleaned.toLowerCase());
  if (exists) return current;

  const next = [...current, cleaned];
  persistTags(next);
  return next;
}

export function deleteAvailableTag(tagToDelete: string): string[] {
  const current = loadAvailableTags();
  const next = current.filter(
    (tag) => tag.toLowerCase() !== tagToDelete.toLowerCase(),
  );
  persistTags(next);
  return next;
}

export function resetDefaultTags(): string[] {
  const next = [...DEFAULT_TAGS];
  persistTags(next);
  return next;
}

export function useAvailableTags() {
  const [tags, setTags] = useState<string[]>(() => loadAvailableTags());

  useEffect(() => {
    const listener = (updated: string[]) => setTags(updated);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const addTag = useCallback((tag: string) => addAvailableTag(tag), []);
  const removeTag = useCallback((tag: string) => deleteAvailableTag(tag), []);
  const resetTags = useCallback(() => resetDefaultTags(), []);

  return {
    availableTags: tags,
    addTag,
    removeTag,
    resetTags,
  };
}