import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuthStore } from "@/hooks/use-auth";

type PresenceStatus = "online" | "idle" | "offline";

interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

interface PresenceContextType {
  presenceMap: Record<number, PresenceEntry>;
  getUserPresence: (userId: number) => PresenceEntry;
}

const IDLE_TIMEOUT = 5 * 60 * 1000;
const defaultEntry: PresenceEntry = { status: "offline", lastSeenAt: null };

const PresenceContext = createContext<PresenceContextType>({
  presenceMap: {},
  getUserPresence: () => defaultEntry,
});

export function usePresenceContext() {
  return useContext(PresenceContext);
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuthStore();
  const [presenceMap, setPresenceMap] = useState<Record<number, PresenceEntry>>({});
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${token}`);
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

    ws.onclose = () => { wsRef.current = null; };

    const fetchPresence = async () => {
      try {
        const res = await fetch("/api/presence", {
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
    };
    fetchPresence();

    const sendPresence = (status: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "presence", status }));
      }
    };

    const resetIdleTimer = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        sendPresence("online");
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        sendPresence("idle");
      }, IDLE_TIMEOUT);
    };

    const onVisChange = () => {
      if (document.hidden) {
        sendPresence("idle");
      } else {
        sendPresence("online");
        resetIdleTimer();
      }
    };

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    events.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisChange);
    ws.addEventListener("open", () => {
      sendPresence("online");
      resetIdleTimer();
    });

    return () => {
      events.forEach(e => document.removeEventListener(e, resetIdleTimer));
      document.removeEventListener("visibilitychange", onVisChange);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      ws.close();
    };
  }, [user, token]);

  const getUserPresence = useCallback((userId: number): PresenceEntry => {
    return presenceMap[userId] || defaultEntry;
  }, [presenceMap]);

  return (
    <PresenceContext.Provider value={{ presenceMap, getUserPresence }}>
      {children}
    </PresenceContext.Provider>
  );
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
