import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

function getBaseUrl(): string {
  if (Platform.OS === "web") return "";
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "";
}

const BASE_URL = getBaseUrl();

interface CicoStatus {
  employeeId: string;
  status: "present" | "break" | "wfh" | "absent" | "off";
  checkInTime?: string;
  checkOutTime?: string;
  location?: string;
  updatedAt: string;
}

interface User {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
  role: "admin" | "manager" | "employee";
  isActive: boolean;
  cicoStatus?: CicoStatus;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (employeeId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const stored = await AsyncStorage.getItem("auth_token");
      if (stored) {
        setToken(stored);
        const res = await fetch(`${BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          await AsyncStorage.removeItem("auth_token");
        }
      }
    } catch (e) {
      console.error("Session load error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(employeeId: string, password: string) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Login gagal");
    }
    const data = await res.json();
    await AsyncStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    try {
      if (token) {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    await AsyncStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUser(await res.json());
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
