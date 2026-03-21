import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface TypingIndicatorsState {
  typingUsers: number[];
  sendTyping: () => void;
}

export function useTypingIndicators(conversationId: number): TypingIndicatorsState {
  const { user } = useAuth();
  const [typingUsers] = useState<number[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendTyping = useCallback(() => {
    if (!conversationId || !user) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    api.post(`/conversations/${conversationId}/typing`, {}).catch(() => {});

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2500);
  }, [conversationId, user]);

  return {
    typingUsers,
    sendTyping,
  };
}
