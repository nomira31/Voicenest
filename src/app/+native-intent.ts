import { getShareExtensionKey } from "expo-share-intent";

/**
 * Expo Router calls this for incoming native links. expo-share-intent puts its payload behind
 * a generated `dataUrl` link; route that launch to the Library, where the import bridge runs.
 */
export function redirectSystemPath({ path }: { path: string; initial: string }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return "/(tabs)/library";
    }
    return path;
  } catch (error) {
    console.warn("Could not resolve the shared-item route:", error);
    return "/";
  }
}
