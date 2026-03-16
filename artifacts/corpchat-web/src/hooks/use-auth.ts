import { create } from "zustand";
import { User, LoginRequest, LoginResponse } from "@workspace/api-client-react";
import { useEffect } from "react";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (response: LoginResponse) => void;
  setUser: (user: User) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("corpchat_token"),
  isAuthenticated: !!localStorage.getItem("corpchat_token"),
  isLoading: true,

  setAuth: (response: LoginResponse) => {
    localStorage.setItem("corpchat_token", response.token);
    set({ user: response.user, token: response.token, isAuthenticated: true });
  },

  setUser: (user: User) => {
    set({ user });
  },

  logout: () => {
    localStorage.removeItem("corpchat_token");
    set({ user: null, token: null, isAuthenticated: false });
    window.location.href = "/login";
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
      } else {
        get().logout();
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
