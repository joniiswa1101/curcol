import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './use-auth';
import { getListMessagesQueryKey, getListConversationsQueryKey } from '@workspace/api-client-react';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isDestroyed = false;

    const connect = () => {
      if (isDestroyed) return;

      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'new_message' && data.conversationId && data.data) {
            const newMsg = data.data;
            const qKey = getListMessagesQueryKey(data.conversationId);

            // Directly inject message into cache — no refetch needed
            queryClient.setQueryData(qKey, (old: any) => {
              if (!old) return { messages: [newMsg], hasMore: false };
              // Avoid duplicates (our own optimistic message gets replaced by server broadcast)
              const exists = old.messages.some((m: any) => m.id === newMsg.id);
              if (exists) return old;
              // Remove any temp optimistic message with same content + sender
              const cleaned = old.messages.filter((m: any) =>
                !(m.id > 1000000000000 && m.senderId === newMsg.senderId && m.content === newMsg.content)
              );
              return { ...old, messages: [...cleaned, newMsg] };
            });

            // Refresh conversation list (last message preview)
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

          if (data.type === 'cico_update') {
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          }
        } catch (err) {
          console.error('WebSocket message parse error', err);
        }
      };

      ws.current.onclose = () => {
        if (!isDestroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.current.onerror = () => {
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
