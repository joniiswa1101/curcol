import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './use-auth';
import { getListMessagesQueryKey, getListConversationsQueryKey } from '@workspace/api-client-react';

let mainWsRef: { ws: WebSocket | null } = { ws: null };

export function sendViaMainWebSocket(data: object) {
  if (mainWsRef.ws?.readyState === WebSocket.OPEN) {
    mainWsRef.ws.send(JSON.stringify(data));
  } else {
    console.error('[WebSocket] Main WebSocket not available for sending:', data);
  }
}

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
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isDestroyed = false;

    const getBackoffDelay = (retryCount: number): number => {
      const exponentialDelay = baseDelay * Math.pow(2, retryCount);
      const maxDelay = 30000;
      return Math.min(exponentialDelay, maxDelay);
    };

    const connect = () => {
      if (isDestroyed) return;

      console.log(`[WebSocket] Connecting to: ${wsUrl} (attempt ${retryCountRef.current + 1}/${maxRetries})`);
      ws.current = new WebSocket(wsUrl);

      let pingTimer: ReturnType<typeof setInterval>;

      ws.current.onopen = () => {
        console.log('[WebSocket] ✅ Connected');
        mainWsRef.ws = ws.current;
        retryCountRef.current = 0;
        pingTimer = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', data.type);

          if (data.type === 'new_message' && data.conversationId && data.data) {
            const newMsg = data.data;
            const qKey = getListMessagesQueryKey(data.conversationId);
            console.log('[WebSocket] Updating cache with new message:', newMsg.id);

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

          // Dispatch call-related messages as custom events for CallContext
          if (['call_offer', 'call_answer', 'call_ice_candidate', 'call_reject', 'call_end'].includes(data.type)) {
            window.dispatchEvent(new CustomEvent('call-signal', { detail: data }));
          }
        } catch (err) {
          console.error('[WebSocket] Message parse error', err);
        }
      };

      ws.current.onclose = () => {
        clearInterval(pingTimer);
        
        if (retryCountRef.current < maxRetries) {
          const delay = getBackoffDelay(retryCountRef.current);
          console.log(`[WebSocket] ❌ Disconnected, reconnecting in ${delay / 1000}s (attempt ${retryCountRef.current + 1}/${maxRetries})`);
          retryCountRef.current++;
          
          if (!isDestroyed) {
            reconnectTimer = setTimeout(connect, delay);
          }
        } else {
          console.error(`[WebSocket] Failed to reconnect after ${maxRetries} attempts. Giving up.`);
        }
      };

      ws.current.onerror = (err) => {
        clearInterval(pingTimer);
        console.error('[WebSocket] Error:', err);
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
