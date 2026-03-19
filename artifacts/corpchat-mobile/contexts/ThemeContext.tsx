import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: "light" | "dark";
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("curcol_theme_preference");
        if (saved && ["light", "dark", "system"].includes(saved)) {
          setPreferenceState(saved as ThemePreference);
        }
      } catch {
        // Fallback to system
      }
      setIsLoaded(true);
    })();
  }, []);

  const setPreference = async (pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      await AsyncStorage.setItem("curcol_theme_preference", pref);
    } catch {
      // Ignore storage errors
    }
  };

  // Determine actual theme based on preference
  const theme: "light" | "dark" =
    preference === "system"
      ? (systemScheme || "light")
      : preference;

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
