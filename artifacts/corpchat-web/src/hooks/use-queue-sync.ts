import { useEffect, useRef, useCallback } from "react"
import { useAuthStore } from "./use-auth"
import { useOfflineQueue } from "./use-offline-queue"

interface UseSyncConfig {
  onSyncSuccess?: (messageId: string) => void
  onSyncError?: (messageId: string, error: Error) => void
}

export function useQueueSync(config?: UseSyncConfig) {
  const { token } = useAuthStore()
  const { isOnline, getQueue, dequeue, updateRetryCount, MAX_RETRIES } = useOfflineQueue(null)
  const syncInProgressRef = useRef(false)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncMessage = useCallback(
    async (message: any) => {
      if (!token) return false

      try {
        const response = await fetch("/api/conversations/" + message.conversationId + "/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: message.content,
            type: message.type,
            attachmentIds: message.attachmentIds,
            replyToId: message.replyToId,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        dequeue(message.id)
        config?.onSyncSuccess?.(message.id)
        return true
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        const newCount = message.retryCount + 1

        if (newCount >= MAX_RETRIES) {
          dequeue(message.id)
          config?.onSyncError?.(message.id, err)
        } else {
          updateRetryCount(message.id, newCount)
        }

        return false
      }
    },
    [token, dequeue, updateRetryCount, MAX_RETRIES, config]
  )

  const syncQueue = useCallback(async () => {
    if (syncInProgressRef.current || !isOnline) return

    syncInProgressRef.current = true
    const queue = getQueue()

    for (const msg of queue) {
      await syncMessage(msg)
      await new Promise(r => setTimeout(r, 500))
    }

    syncInProgressRef.current = false
  }, [isOnline, getQueue, syncMessage])

  useEffect(() => {
    if (!isOnline) return

    syncQueue()

    syncIntervalRef.current = setInterval(syncQueue, 5000)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [isOnline, syncQueue])

  return { syncQueue, isOnline }
}
