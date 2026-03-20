import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/hooks/use-auth";

interface TypingIndicatorsState {
  typingUsers: number[];
  sendTyping: () => void;
}

export function useTypingIndicators(conversationId: number): TypingIndicatorsState {
  const { user } = useAuthStore();
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const setupWebSocket = () => {
      const token = localStorage.getItem("token");
      if (!token || !user) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const domain = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : "";
      const url = `${protocol}//${domain}${port}/ws?token=${token}`;

      const newWs = new WebSocket(url);

      newWs.onopen = () => {
        console.log("[Typing] WebSocket connected");
        ws.current = newWs;
      };

      newWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "typing" && message.conversationId === conversationId) {
            const typingList = message.typingUsers || [];
            const filteredTyping = typingList.filter((id: number) => id !== user?.id);
            setTypingUsers(filteredTyping);
          }
        } catch (err) {
          console.error("[Typing] Failed to parse message:", err);
        }
      };

      newWs.onerror = (error) => {
        console.error("[Typing] WebSocket error:", error);
      };

      newWs.onclose = () => {
        console.log("[Typing] WebSocket disconnected");
        ws.current = null;
      };

      return newWs;
    };

    setupWebSocket();

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, user]);

  const sendTyping = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !user) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    ws.current.send(
      JSON.stringify({
        type: "typing",
        conversationId,
        userIds: [],
      })
    );

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2500);
  }, [conversationId, user]);

  return {
    typingUsers,
    sendTyping,
  };
}
