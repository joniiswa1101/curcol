import { useCallback, useRef, useEffect } from "react"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "./use-auth"

export function useReadReceipts(conversationId: number | null) {
  const { user } = useAuthStore()
  const markingRef = useRef<Set<number>>(new Set())

  const markMessageAsRead = useCallback(async (messageId: number) => {
    if (!conversationId || !user || markingRef.current.has(messageId)) return

    markingRef.current.add(messageId)

    try {
      const response = await fetch(
        `${API_URL}/api/conversations/${conversationId}/messages/${messageId}/read`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }
      )

      if (!response.ok) {
        markingRef.current.delete(messageId)
      }
    } catch (error) {
      console.error("Failed to mark message as read:", error)
      markingRef.current.delete(messageId)
    }
  }, [conversationId, user])

  const markConversationAsRead = useCallback(async () => {
    if (!conversationId || !user) return

    try {
      await fetch(`${API_URL}/api/conversations/${conversationId}/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
    } catch (error) {
      console.error("Failed to mark conversation as read:", error)
    }
  }, [conversationId, user])

  return {
    markMessageAsRead,
    markConversationAsRead,
  }
}
