import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { playNotificationSound } from '@/lib/notification-sound';

export function useWebSocket(conversationId: string | string[] | undefined) {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingTimerRef = useRef<NodeJS.Timeout>();
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      console.log('[WebSocket] App state changed:', state);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setupWebSocket = async () => {
      const token = await AsyncStorage.getItem('auth_token');
      const userDataStr = await AsyncStorage.getItem('auth_user');
      let currentUserId: number | null = null;
      if (userDataStr) {
        try { currentUserId = JSON.parse(userDataStr).id; } catch {}
      }
      if (!token || !conversationId) return;

      // Convert array to string if needed
      const convId = Array.isArray(conversationId) ? conversationId[0] : conversationId;
      if (!convId || !isMounted) return;

      // Build WebSocket URL — handle both dev and production environments
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const wsProtocol = domain ? 'wss:' : 'ws:';
      const wsHost = domain ? domain : 'localhost:8080';
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws?token=${token}`;

      console.log('[WebSocket] Connecting to:', wsUrl);

      try {
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log('[WebSocket] ✅ Connected');
          
          // Adaptive heartbeat:
          // - Active/Foreground: 45s ping (battery efficient)
          // - Background: 50s ping (minimal overhead)
          // - Server timeout: 60s, so client pings before timeout
          const schedulePing = () => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
            
            const pingInterval = appStateRef.current === 'active' ? 45000 : 50000;
            console.log(`[WebSocket] Scheduling ping every ${pingInterval}ms (state: ${appStateRef.current})`);
            
            ws.current.send(JSON.stringify({ type: 'ping' }));
            if (pingTimerRef.current) clearInterval(pingTimerRef.current as any);
            pingTimerRef.current = setInterval(() => {
              if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'ping' }));
              }
            }, pingInterval) as any;
          };

          schedulePing();
        };

        ws.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] Message received:', data.type);

            // Handle new message
            if (data.type === 'new_message' && data.conversationId?.toString() === convId?.toString()) {
              const newMsg = data.data;
              const qKey = ['messages', convId];
              console.log('[WebSocket] Updating cache with new message:', newMsg.id);

              queryClient.setQueryData(qKey, (old: any) => {
                if (!old) return { messages: [newMsg] };
                const exists = old.messages?.some((m: any) => m.id === newMsg.id);
                if (exists) return old;
                const cleaned = old.messages?.filter((m: any) =>
                  !(m.id < 0 && m.senderId === newMsg.senderId && m.content === newMsg.content)
                ) || [];
                return { ...old, messages: [...cleaned, newMsg] };
              });

              queryClient.invalidateQueries({ queryKey: ['conversations'] });

              if (currentUserId && newMsg.senderId !== currentUserId) {
                playNotificationSound();
              }
            }

            if (data.type === 'new_message' && data.conversationId?.toString() !== convId?.toString()) {
              queryClient.invalidateQueries({ queryKey: ['conversations'] });

              if (currentUserId && data.data?.senderId !== currentUserId) {
                playNotificationSound();
              }
            }

            // Handle message edit
            if (data.type === 'message_updated' && data.conversationId?.toString() === convId?.toString()) {
              const updatedMsg = data.data;
              const qKey = ['messages', convId];
              queryClient.setQueryData(qKey, (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages?.map((m: any) => m.id === updatedMsg.id ? updatedMsg : m) || []
                };
              });
            }

            // Handle message delete
            if (data.type === 'message_deleted' && data.conversationId?.toString() === convId?.toString()) {
              const msgId = data.data?.id;
              const qKey = ['messages', convId];
              queryClient.setQueryData(qKey, (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages?.map((m: any) => m.id === msgId ? { ...m, isDeleted: true } : m) || []
                };
              });
            }

            // Handle message pin
            if (data.type === 'message_pinned' && data.conversationId?.toString() === convId?.toString()) {
              const msgId = data.data?.messageId;
              const isPinned = data.data?.isPinned;
              const qKey = ['messages', convId];
              queryClient.setQueryData(qKey, (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  messages: old.messages?.map((m: any) => m.id === msgId ? { ...m, isPinned } : m) || []
                };
              });
            }

            // Handle typing indicators
            if (data.type === 'typing_indicator') {
              console.log('[WebSocket] Typing indicator:', data.data?.userName);
            }

            if (data.type === 'group_call_started') {
              console.log('[WebSocket] Group call started:', data.roomName, 'by', data.startedByName);
              const { Alert } = require('react-native');
              const { router } = require('expo-router');
              Alert.alert(
                "Group Call",
                `${data.startedByName} memulai ${data.callType === 'video' ? 'video' : 'voice'} call`,
                [
                  { text: "Nanti", style: "cancel" },
                  {
                    text: "Gabung",
                    onPress: () => {
                      router.push({
                        pathname: "/jitsi-call",
                        params: {
                          roomName: data.roomName,
                          callType: data.callType,
                          conversationId: data.conversationId?.toString(),
                        },
                      });
                    },
                  },
                ]
              );
            }

            if (data.type === 'group_call_ended') {
              console.log('[WebSocket] Group call ended:', data.roomName);
              const { Alert } = require('react-native');
              Alert.alert("Group Call", "Group call telah berakhir");
            }

            if (data.type === 'adhoc_call_started') {
              console.log('[WebSocket] Adhoc call started:', data.roomName, 'by', data.startedByName);
              const { Alert } = require('react-native');
              const { router } = require('expo-router');
              Alert.alert(
                "Multi-point Call",
                `${data.startedByName} mengundang Anda ke ${data.callType === 'video' ? 'video' : 'voice'} call`,
                [
                  { text: "Tolak", style: "cancel" },
                  {
                    text: "Gabung",
                    onPress: () => {
                      router.push({
                        pathname: "/jitsi-call",
                        params: {
                          roomName: data.roomName,
                          callType: data.callType,
                          conversationId: "adhoc",
                        },
                      });
                    },
                  },
                ]
              );
            }

            if (data.type === 'adhoc_call_ended') {
              console.log('[WebSocket] Adhoc call ended:', data.roomName);
              const { Alert } = require('react-native');
              Alert.alert("Multi-point Call", "Multi-point call telah berakhir");
            }
          } catch (err) {
            console.error('[WebSocket] Message parse error:', err);
          }
        };

        ws.current.onclose = () => {
          console.log('[WebSocket] ❌ Disconnected, reconnecting in 3s...');
          if (pingTimerRef.current) clearInterval(pingTimerRef.current as any);
          if (isMounted) {
            reconnectTimeoutRef.current = setTimeout(setupWebSocket, 3000);
          }
        };

        ws.current.onerror = (err) => {
          console.error('[WebSocket] Error:', err);
          if (pingTimerRef.current) clearInterval(pingTimerRef.current as any);
          ws.current?.close();
        };
      } catch (err) {
        console.error('[WebSocket] Connection error:', err);
      }
    };

    setupWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current as any);
      ws.current?.close();
    };
  }, [conversationId, queryClient]);

  return ws.current;
}
