import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './use-auth';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    let reconnectTimer: number;

    const connect = () => {
      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Invalidate relevant queries based on real-time events
          if (data.type === 'new_message' || data.type === 'message_updated') {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
            if (data.conversationId) {
              queryClient.invalidateQueries({ queryKey: [`/api/conversations/${data.conversationId}/messages`] });
            }
          }
          if (data.type === 'cico_update') {
            queryClient.invalidateQueries({ queryKey: ['/api/cico/status'] });
            queryClient.invalidateQueries({ queryKey: ['/api/users'] });
          }
        } catch (err) {
          console.error('WebSocket message parse error', err);
        }
      };

      ws.current.onclose = () => {
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, [token, queryClient]);

  return ws.current;
}
