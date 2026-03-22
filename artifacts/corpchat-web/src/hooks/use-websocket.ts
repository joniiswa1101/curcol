import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './use-auth';
import { getListMessagesQueryKey, getListConversationsQueryKey } from '@workspace/api-client-react';
import { emitCallSignal, registerWsSend } from '@/lib/call-signal-bus';
import { emitGroupCallSignal } from '@/lib/group-call-bus';

const CALL_TYPES = new Set([
  'call_offer', 'call_answer', 'call_ice_candidate', 'call_reject', 'call_end', 'call_failed'
]);

const GROUP_CALL_TYPES = new Set([
  'group_call_started', 'group_call_ended', 'group_call_joined', 'group_call_left'
]);

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const token = useAuthStore(state => state.token);
  const retryCountRef = useRef(0);
  const maxRetries = 10;
  const baseDelay = 3000;

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${token}`;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isDestroyed = false;

    const getBackoffDelay = (retryCount: number): number => {
      const exponentialDelay = baseDelay * Math.pow(2, retryCount);
      const maxDelay = 30000;
      return Math.min(exponentialDelay, maxDelay);
    };

    const connect = () => {
      if (isDestroyed) return;

      console.log(`[WS] Connecting (attempt ${retryCountRef.current + 1}/${maxRetries})`);
      ws.current = new WebSocket(wsUrl);

      let pingTimer: ReturnType<typeof setInterval>;

      ws.current.onopen = () => {
        console.log('[WS] ✅ Connected');
        retryCountRef.current = 0;

        registerWsSend((data: object) => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            console.log('[WS] Sending:', (data as any).type);
            ws.current.send(JSON.stringify(data));
          } else {
            console.error('[WS] Cannot send, not OPEN:', (data as any).type);
          }
        });

        pingTimer = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type !== 'pong') {
            console.log('[WS] Received:', data.type);
          }

          if (CALL_TYPES.has(data.type)) {
            emitCallSignal(data);
            return;
          }

          if (GROUP_CALL_TYPES.has(data.type)) {
            emitGroupCallSignal(data);
            return;
          }

          if (data.type === 'new_message' && data.conversationId && data.data) {
            const newMsg = data.data;
            const qKey = getListMessagesQueryKey(data.conversationId);

            queryClient.setQueryData(qKey, (old: any) => {
              if (!old) return { messages: [newMsg], hasMore: false };
              const exists = old.messages.some((m: any) => m.id === newMsg.id);
              if (exists) return old;
              const cleaned = old.messages.filter((m: any) =>
                !(m.id > 1000000000000 && m.senderId === newMsg.senderId && m.content === newMsg.content)
              );
              return { ...old, messages: [...cleaned, newMsg] };
            });

            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          }

          if (data.type === 'message_updated' && data.conversationId && data.data) {
            const updatedMsg = data.data;
            const qKey = getListMessagesQueryKey(data.conversationId);
            queryClient.setQueryData(qKey, (old: any) => {
              if (!old) return old;
              return {
                ...old,
                messages: old.messages.map((m: any) => m.id === updatedMsg.id ? updatedMsg : m)
              };
            });
          }

          if (data.type === 'update_message' && data.conversationId && data.data) {
            const updatedMsg = data.data;
            const qKey = getListMessagesQueryKey(data.conversationId);
            queryClient.setQueryData(qKey, (old: any) => {
              if (!old) return old;
              return {
                ...old,
                messages: old.messages.map((m: any) => m.id === updatedMsg.id ? updatedMsg : m)
              };
            });
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          }

          if (data.type === 'cico_update') {
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
            useAuthStore.getState().checkAuth();
          }
        } catch (err) {
          console.error('[WS] Message parse error', err);
        }
      };

      ws.current.onclose = () => {
        clearInterval(pingTimer);

        if (retryCountRef.current < maxRetries) {
          const delay = getBackoffDelay(retryCountRef.current);
          console.log(`[WS] Disconnected, reconnecting in ${delay / 1000}s`);
          retryCountRef.current++;

          if (!isDestroyed) {
            reconnectTimer = setTimeout(connect, delay);
          }
        } else {
          console.error(`[WS] Failed to reconnect after ${maxRetries} attempts.`);
        }
      };

      ws.current.onerror = (err) => {
        clearInterval(pingTimer);
        console.error('[WS] Error:', err);
        ws.current?.close();
      };
    };

    connect();

    return () => {
      isDestroyed = true;
      clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, [token, queryClient]);

  return ws.current;
}
