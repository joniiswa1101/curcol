import { useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { api } from "@/lib/api";

export interface QueuedMessage {
  id: string;
  conversationId: number;
  content: string;
  type: string;
  replyToId?: number;
  createdAt: string;
  retryCount: number;
  status: "pending" | "sending" | "failed";
}

const STORAGE_KEY = "offline_message_queue";
const MAX_RETRIES = 3;
const SYNC_DELAY = 500;

export function useOfflineQueue(userId: number | undefined, onSyncComplete?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : null;

  const loadQueue = useCallback(async () => {
    if (!storageKey) {
      setQueue([]);
      return;
    }
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (mountedRef.current) {
        setQueue(stored ? JSON.parse(stored) : []);
      }
    } catch {
      if (mountedRef.current) setQueue([]);
    }
  }, [storageKey]);

  const saveQueue = useCallback(async (msgs: QueuedMessage[]) => {
    if (!storageKey) return;
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(msgs));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    mountedRef.current = true;
    loadQueue();
    return () => { mountedRef.current = false; };
  }, [loadQueue]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  const enqueue = useCallback((msg: {
    conversationId: number;
    content: string;
    type?: string;
    replyToId?: number;
  }) => {
    const queued: QueuedMessage = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId: msg.conversationId,
      content: msg.content,
      type: msg.type || "text",
      replyToId: msg.replyToId,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: "pending",
    };
    setQueue(prev => {
      const updated = [...prev, queued];
      saveQueue(updated);
      return updated;
    });
    return queued;
  }, [saveQueue]);

  const removeFromQueue = useCallback((queueId: string) => {
    setQueue(prev => {
      const updated = prev.filter(m => m.id !== queueId);
      saveQueue(updated);
      return updated;
    });
  }, [saveQueue]);

  const markFailed = useCallback((queueId: string) => {
    setQueue(prev => {
      const updated = prev.map(m =>
        m.id === queueId ? { ...m, status: "failed" as const, retryCount: m.retryCount + 1 } : m
      );
      saveQueue(updated);
      return updated;
    });
  }, [saveQueue]);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !isOnline || !userId) return;
    syncingRef.current = true;

    const pending = queue.filter(m => m.status === "pending" || m.status === "failed");
    let synced = 0;
    for (const msg of pending) {
      if (!mountedRef.current) break;

      if (msg.retryCount >= MAX_RETRIES) {
        continue;
      }

      setQueue(prev => {
        const updated = prev.map(m => m.id === msg.id ? { ...m, status: "sending" as const } : m);
        saveQueue(updated);
        return updated;
      });

      try {
        await api.post(`/conversations/${msg.conversationId}/messages`, {
          content: msg.content,
          type: msg.type,
          replyToId: msg.replyToId,
        });
        removeFromQueue(msg.id);
        synced++;
      } catch {
        markFailed(msg.id);
      }

      await new Promise(r => setTimeout(r, SYNC_DELAY));
    }

    if (synced > 0) {
      onSyncCompleteRef.current?.();
    }

    syncingRef.current = false;
  }, [isOnline, userId, queue, saveQueue, removeFromQueue, markFailed]);

  useEffect(() => {
    if (!isOnline) return;
    const pending = queue.filter(m => (m.status === "pending" || m.status === "failed") && m.retryCount < MAX_RETRIES);
    if (pending.length === 0) return;

    const timer = setTimeout(() => syncQueue(), 1000);
    return () => clearTimeout(timer);
  }, [isOnline, queue, syncQueue]);

  const retryMessage = useCallback((queueId: string) => {
    setQueue(prev => {
      const updated = prev.map(m =>
        m.id === queueId ? { ...m, status: "pending" as const, retryCount: 0 } : m
      );
      saveQueue(updated);
      return updated;
    });
  }, [saveQueue]);

  const discardMessage = useCallback((queueId: string) => {
    removeFromQueue(queueId);
  }, [removeFromQueue]);

  const getQueuedForConversation = useCallback((conversationId: number) => {
    return queue.filter(m => m.conversationId === conversationId);
  }, [queue]);

  return {
    isOnline,
    queue,
    queuedCount: queue.length,
    enqueue,
    retryMessage,
    discardMessage,
    getQueuedForConversation,
    syncQueue,
    MAX_RETRIES,
  };
}
