import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "voicenest_access_token";

async function getStoredToken() {
  if (Platform.OS === "web") {
    return null;
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function saveToken(token: string | null) {
  if (Platform.OS === "web") {
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getStoredToken()
      .then((token) => {
        if (mounted) {
          setIsAuthenticated(Boolean(token));
        }
      })
      .catch(() => {
        if (mounted) {
          setIsAuthenticated(false);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    await saveToken(token);
    setIsAuthenticated(true);
  }, []);

  const signOut = useCallback(async () => {
    await saveToken(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
