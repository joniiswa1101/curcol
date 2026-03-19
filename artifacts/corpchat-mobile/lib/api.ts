import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

function getBaseUrl(): string {
  if (Platform.OS === "web") {
    return "";
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "";
}

const BASE_URL = getBaseUrl();

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("auth_token");
}

async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem("auth_refresh_token");
}

async function storeTokens(token: string, refreshToken: string, expiresAt?: string) {
  await AsyncStorage.setItem("auth_token", token);
  await AsyncStorage.setItem("auth_refresh_token", refreshToken);
  if (expiresAt) await AsyncStorage.setItem("auth_token_expires", expiresAt);
}

async function clearTokens() {
  await AsyncStorage.multiRemove(["auth_token", "auth_refresh_token", "auth_token_expires"]);
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "APIError";
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    const rt = await getRefreshToken();
    if (!rt) return false;

    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;

      const data = await res.json();
      await storeTokens(data.token, data.refreshToken, data.expiresAt);
      return true;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function apiFetch(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers });

  if (res.status === 401 && !retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, options, true);
    }
    await clearTokens();
    throw new APIError(401, "Session expired. Please login again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new APIError(res.status, err.message || "Request failed");
  }
  return res.json();
}

export { storeTokens, clearTokens, getToken, getRefreshToken };

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body: unknown) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};
