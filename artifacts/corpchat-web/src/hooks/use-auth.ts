import { create } from "zustand";
import { User, LoginRequest, LoginResponse } from "@workspace/api-client-react";
import { useEffect } from "react";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (response: any) => void;
  setUser: (user: User) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(expiresAt: string, refreshFn: () => Promise<boolean>) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const expiresMs = new Date(expiresAt).getTime();
  const now = Date.now();
  const refreshIn = Math.max((expiresMs - now) - 60_000, 5_000);
  refreshTimer = setTimeout(async () => {
    const success = await refreshFn();
    if (!success) {
      console.warn("[Auth] Refresh failed, logging out");
    }
  }, refreshIn);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("curcol_token"),
  isAuthenticated: !!localStorage.getItem("curcol_token"),
  isLoading: true,

  setAuth: (response: any) => {
    localStorage.setItem("curcol_token", response.token);
    if (response.refreshToken) {
      localStorage.setItem("curcol_refresh_token", response.refreshToken);
    }
    if (response.expiresAt) {
      localStorage.setItem("curcol_token_expires", response.expiresAt);
    }
    set({ user: response.user, token: response.token, isAuthenticated: true });

    if (response.expiresAt) {
      scheduleRefresh(response.expiresAt, get().refreshAccessToken);
    }
  },

  setUser: (user: User) => {
    set({ user });
  },

  logout: () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    localStorage.removeItem("curcol_token");
    localStorage.removeItem("curcol_refresh_token");
    localStorage.removeItem("curcol_token_expires");
    set({ user: null, token: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  refreshAccessToken: async () => {
    const refreshToken = localStorage.getItem("curcol_refresh_token");
    if (!refreshToken) {
      get().logout();
      return false;
    }

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        get().logout();
        return false;
      }

      const data = await res.json();
      localStorage.setItem("curcol_token", data.token);
      localStorage.setItem("curcol_refresh_token", data.refreshToken);
      localStorage.setItem("curcol_token_expires", data.expiresAt);
      set({ token: data.token });

      scheduleRefresh(data.expiresAt, get().refreshAccessToken);
      return true;
    } catch {
      get().logout();
      return false;
    }
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const user = await res.json();
        set({ user, isAuthenticated: true, isLoading: false });

        const expiresAt = localStorage.getItem("curcol_token_expires");
        if (expiresAt) {
          scheduleRefresh(expiresAt, get().refreshAccessToken);
        }
      } else if (res.status === 401) {
        const refreshed = await get().refreshAccessToken();
        if (refreshed) {
          const retryRes = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${get().token}` }
          });
          if (retryRes.ok) {
            const user = await retryRes.json();
            set({ user, isAuthenticated: true, isLoading: false });
            return;
          }
        }
        get().logout();
        set({ isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      console.error("Auth check failed", err);
      set({ isLoading: false });
    }
  }
}));

export function useAuthInit() {
  const checkAuth = useAuthStore(state => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
}
