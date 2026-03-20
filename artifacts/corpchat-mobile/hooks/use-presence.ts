import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, WS_BASE_URL } from "../config";

type PresenceStatus = "online" | "idle" | "offline";

interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

export function usePresence() {
  const [presenceMap, setPresenceMap] = useState<Record<number, PresenceEntry>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = await AsyncStorage.getItem("curcol_token");
      if (!token || cancelled) return;

      const ws = new WebSocket(`${WS_BASE_URL}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "presence_update") {
            setPresenceMap(prev => ({
              ...prev,
              [msg.userId]: {
                status: msg.status as PresenceStatus,
                lastSeenAt: msg.timestamp,
              },
            }));
          }
        } catch {}
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "presence", status: "online" }));
      };

      ws.onclose = () => { wsRef.current = null; };

      try {
        const res = await fetch(`${API_BASE_URL}/api/presence`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const mapped: Record<number, PresenceEntry> = {};
          for (const [id, p] of Object.entries(data.presence) as any) {
            mapped[Number(id)] = { status: p.status, lastSeenAt: p.lastSeenAt };
          }
          setPresenceMap(mapped);
        }
      } catch {}

      const handleAppState = (state: AppStateStatus) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "presence",
            status: state === "active" ? "online" : "idle",
          }));
        }
      };

      const sub = AppState.addEventListener("change", handleAppState);

      return () => {
        sub.remove();
        ws.close();
      };
    };

    const cleanup = init();

    return () => {
      cancelled = true;
      cleanup.then(fn => fn?.());
    };
  }, []);

  const getUserPresence = useCallback((userId: number): PresenceEntry => {
    return presenceMap[userId] || { status: "offline" as PresenceStatus, lastSeenAt: null };
  }, [presenceMap]);

  return { presenceMap, getUserPresence };
}

export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "";
  const d = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin}m ago`;
  if (diffHr < 24) return `last seen ${diffHr}h ago`;
  return `last seen ${d.toLocaleDateString()}`;
}
