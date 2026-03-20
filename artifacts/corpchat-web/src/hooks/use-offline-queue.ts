import { useState, useCallback, useRef, useEffect } from "react"
import { useAuthStore } from "./use-auth"

interface QueuedMessage {
  id: string
  conversationId: number
  content?: string
  type: string
  attachmentIds?: number[]
  replyToId?: number
  createdAt: string
  retryCount: number
}

const STORAGE_KEY = "offline_message_queue"
const MAX_RETRIES = 3

export function useOfflineQueue(conversationId: number | null) {
  const { user } = useAuthStore()
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true)
  const [queuedCount, setQueuedCount] = useState(0)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const getQueue = useCallback((): QueuedMessage[] => {
    if (!user) return []
    const stored = localStorage.getItem(`${STORAGE_KEY}:${user.id}`)
    return stored ? JSON.parse(stored) : []
  }, [user])

  const updateQueue = useCallback((messages: QueuedMessage[]) => {
    if (!user) return
    localStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(messages))
    setQueuedCount(messages.length)
  }, [user])

  const enqueue = useCallback((message: Omit<QueuedMessage, "id" | "createdAt" | "retryCount">) => {
    if (!user) return
    const queue = getQueue()
    const newMsg: QueuedMessage = {
      ...message,
      id: `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    }
    queue.push(newMsg)
    updateQueue(queue)
    return newMsg
  }, [user, getQueue, updateQueue])

  const dequeue = useCallback((messageId: string) => {
    const queue = getQueue()
    const updated = queue.filter(m => m.id !== messageId)
    updateQueue(updated)
  }, [getQueue, updateQueue])

  const updateRetryCount = useCallback((messageId: string, count: number) => {
    const queue = getQueue()
    const msg = queue.find(m => m.id === messageId)
    if (msg) {
      msg.retryCount = count
      updateQueue(queue)
    }
  }, [getQueue, updateQueue])

  const getQueuedMessages = useCallback(
    (convoId?: number): QueuedMessage[] => {
      const queue = getQueue()
      if (!convoId) return queue
      return queue.filter(m => m.conversationId === convoId)
    },
    [getQueue]
  )

  return {
    isOnline,
    queuedCount,
    enqueue,
    dequeue,
    updateRetryCount,
    getQueue,
    getQueuedMessages,
    MAX_RETRIES,
  }
}
