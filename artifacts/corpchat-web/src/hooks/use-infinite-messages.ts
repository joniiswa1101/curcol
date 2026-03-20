/**
 * Infinite scroll pagination hook for messages
 * Loads messages in batches and caches them locally
 */

import { useCallback, useRef, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useListMessages, getListMessagesQueryKey } from "@workspace/api-client-react"

interface UseInfiniteMessagesOptions {
  conversationId: number
  initialLimit?: number
  onLoadMore?: () => void
}

interface CachedMessages {
  messages: any[]
  oldestMessageId: number | null
  newestMessageId: number | null
  isLoading: boolean
  hasMore: boolean
  lastLoadedBatch: any[]
}

/**
 * Hook for infinite scroll pagination with local caching
 * Manages message pagination, caching, and scroll loading
 */
export function useInfiniteMessages({
  conversationId,
  initialLimit = 50,
  onLoadMore
}: UseInfiniteMessagesOptions) {
  const queryClient = useQueryClient()
  const cacheRef = useRef<CachedMessages>({
    messages: [],
    oldestMessageId: null,
    newestMessageId: null,
    isLoading: false,
    hasMore: true,
    lastLoadedBatch: [],
  })

  // Load initial messages (most recent)
  const { data: initialData, isLoading: isInitialLoading } = useListMessages(
    conversationId,
    { limit: initialLimit }
  )

  // State for paginated loading
  const [messages, setMessages] = useState<any[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Initialize cache with initial messages
  useEffect(() => {
    if (initialData?.messages && initialData.messages.length > 0) {
      const msgs = initialData.messages
      cacheRef.current.messages = msgs
      cacheRef.current.oldestMessageId = msgs[msgs.length - 1]?.id || null
      cacheRef.current.newestMessageId = msgs[0]?.id || null
      cacheRef.current.hasMore = (initialData.hasMore ?? true) && msgs.length >= initialLimit
      cacheRef.current.lastLoadedBatch = msgs

      setMessages(msgs)
      setHasMore(cacheRef.current.hasMore)
    }
  }, [initialData, initialLimit])

  /**
   * Load older messages (for scroll up)
   */
  const loadOlderMessages = useCallback(async () => {
    if (!cacheRef.current.oldestMessageId || isLoadingMore || !hasMore) return

    setIsLoadingMore(true)
    try {
      // Fetch messages before the oldest cached message
      const result = await queryClient.fetchQuery({
        queryKey: getListMessagesQueryKey(conversationId, {
          before: cacheRef.current.oldestMessageId,
          limit: initialLimit,
        }),
        queryFn: async () => {
          const res = await fetch(
            `/api/conversations/${conversationId}/messages?before=${cacheRef.current.oldestMessageId}&limit=${initialLimit}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
              },
            }
          )
          if (!res.ok) throw new Error("Failed to load messages")
          return res.json()
        },
      }) as any

      if (result?.messages && result.messages.length > 0) {
        const newMessages = result.messages
        // Dedup and merge: put old messages first, then current cache
        const dedupedOld = newMessages.filter(
          (msg: any) => !cacheRef.current.messages.some(m => m.id === msg.id)
        )

        cacheRef.current.messages = [...dedupedOld, ...cacheRef.current.messages]
        cacheRef.current.oldestMessageId = newMessages[newMessages.length - 1]?.id || null
        cacheRef.current.hasMore = (result.hasMore ?? true) && newMessages.length >= initialLimit

        setMessages(cacheRef.current.messages)
        setHasMore(cacheRef.current.hasMore)
      } else {
        setHasMore(false)
      }

      onLoadMore?.()
    } catch (error) {
      console.error("Error loading older messages:", error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [conversationId, initialLimit, isLoadingMore, hasMore, queryClient, onLoadMore])

  /**
   * Load newer messages (for scroll down)
   * Note: Not typically used in chat as newer messages come via WebSocket
   * But provided for completeness
   */
  const loadNewerMessages = useCallback(async () => {
    if (!cacheRef.current.newestMessageId || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const result = await queryClient.fetchQuery({
        queryKey: getListMessagesQueryKey(conversationId, {
          limit: initialLimit,
        }),
        queryFn: async () => {
          const res = await fetch(
            `/api/conversations/${conversationId}/messages?limit=${initialLimit}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
              },
            }
          )
          if (!res.ok) throw new Error("Failed to load messages")
          return res.json()
        },
      }) as any

      if (result?.messages && result.messages.length > 0) {
        const newMessages = result.messages
        // Dedup: filter out messages already in cache
        const dedupedNew = newMessages.filter(
          (msg: any) => !cacheRef.current.messages.some(m => m.id === msg.id)
        )

        cacheRef.current.messages = [...cacheRef.current.messages, ...dedupedNew]
        cacheRef.current.newestMessageId = newMessages[0]?.id || null
        setMessages(cacheRef.current.messages)
      }
    } catch (error) {
      console.error("Error loading newer messages:", error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [conversationId, initialLimit, isLoadingMore, queryClient])

  /**
   * Invalidate cache when conversation changes
   */
  useEffect(() => {
    cacheRef.current = {
      messages: [],
      oldestMessageId: null,
      newestMessageId: null,
      isLoading: false,
      hasMore: true,
      lastLoadedBatch: [],
    }
    setMessages([])
    setHasMore(true)
  }, [conversationId])

  return {
    messages,
    isLoading: isInitialLoading,
    isLoadingMore,
    hasMore,
    loadOlderMessages,
    loadNewerMessages,
    cache: cacheRef.current,
  }
}
