import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "./use-websocket";
import { useAuth } from "@/contexts/AuthContext";

interface TypingIndicatorsState {
  typingUsers: number[];
  sendTyping: () => void;
}

export function useTypingIndicators(conversationId: number): TypingIndicatorsState {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const { ws } = useWebSocket();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const handleMessage = (event: Event) => {
      try {
        const data = JSON.parse((event as any).data);

        if (data.type === "typing" && data.conversationId === conversationId) {
          const typingList = data.typingUsers || [];
          const filteredTyping = typingList.filter((id: number) => id !== user?.id);
          setTypingUsers(filteredTyping);
        }
      } catch (err) {
        console.error("[Typing] Failed to parse message:", err);
      }
    };

    ws.addEventListener("message", handleMessage);

    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [conversationId, user, ws]);

  const sendTyping = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !user) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    ws.send(
      JSON.stringify({
        type: "typing",
        conversationId,
        userIds: [],
      })
    );

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2500);
  }, [conversationId, user, ws]);

  return {
    typingUsers,
    sendTyping,
  };
}
