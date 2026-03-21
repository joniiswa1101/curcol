import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api";

type PresenceStatus = "online" | "idle" | "offline";

interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

type Listener = (map: Record<number, PresenceEntry>) => void;

let sharedPresenceMap: Record<number, PresenceEntry> = {};
let listeners: Set<Listener> = new Set();
let initialized = false;
let wsInstance: WebSocket | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let appStateSub: { remove: () => void } | null = null;

function notifyListeners() {
  const snapshot = { ...sharedPresenceMap };
  listeners.forEach(fn => fn(snapshot));
}

function updatePresence(userId: number, entry: PresenceEntry) {
  sharedPresenceMap = { ...sharedPresenceMap, [userId]: entry };
  notifyListeners();
}

async function fetchPresenceData() {
  try {
    const data = await api.get("/presence");
    if (!data?.presence) return;
    const mapped: Record<number, PresenceEntry> = {};
    for (const [id, p] of Object.entries(data.presence) as any) {
      mapped[Number(id)] = { status: p.status, lastSeenAt: p.lastSeenAt };
    }
    sharedPresenceMap = mapped;
    notifyListeners();
  } catch {}
}

async function initPresence() {
  if (initialized) return;
  initialized = true;

  await fetchPresenceData();
  pollTimer = setInterval(fetchPresenceData, 30000);

  const token = await AsyncStorage.getItem("auth_token");
  if (!token) return;

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const wsProtocol = domain ? "wss:" : "ws:";
  const wsHost = domain || "localhost:8080";
  const wsUrl = `${wsProtocol}//${wsHost}/api/ws?token=${token}`;

  const connectWs = () => {
    try {
      const ws = new WebSocket(wsUrl);
      wsInstance = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "presence", status: "online" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "presence_update") {
            updatePresence(msg.userId, {
              status: msg.status as PresenceStatus,
              lastSeenAt: msg.timestamp,
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        wsInstance = null;
        setTimeout(connectWs, 5000);
      };

      ws.onerror = () => { ws.close(); };
    } catch {}
  };

  connectWs();

  const handleAppState = (state: AppStateStatus) => {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({
        type: "presence",
        status: state === "active" ? "online" : "idle",
      }));
    }
  };

  appStateSub = AppState.addEventListener("change", handleAppState);
}

export function usePresence() {
  const [presenceMap, setPresenceMap] = useState<Record<number, PresenceEntry>>(sharedPresenceMap);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    initPresence();

    const listener: Listener = (map) => {
      if (mountedRef.current) setPresenceMap(map);
    };
    listeners.add(listener);

    setPresenceMap({ ...sharedPresenceMap });

    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
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

  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHr < 24) return `${diffHr} jam lalu`;
  return d.toLocaleDateString("id-ID");
}
