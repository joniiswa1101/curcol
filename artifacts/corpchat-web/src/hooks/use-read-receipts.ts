import { useCallback, useRef } from "react"
import { useAuthStore } from "./use-auth"

export function useReadReceipts(conversationId: number | null) {
  const { user, token } = useAuthStore()
  const markingRef = useRef<Set<number>>(new Set())

  const markMessageAsRead = useCallback(async (messageId: number) => {
    if (!conversationId || !user || markingRef.current.has(messageId)) return

    markingRef.current.add(messageId)

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages/${messageId}/read`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        markingRef.current.delete(messageId)
      }
    } catch (error) {
      console.error("Failed to mark message as read:", error)
      markingRef.current.delete(messageId)
    }
  }, [conversationId, user, token])

  const markConversationAsRead = useCallback(async () => {
    if (!conversationId || !user) return

    try {
      await fetch(`/api/conversations/${conversationId}/mark-read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      console.error("Failed to mark conversation as read:", error)
    }
  }, [conversationId, user, token])

  return {
    markMessageAsRead,
    markConversationAsRead,
  }
}
