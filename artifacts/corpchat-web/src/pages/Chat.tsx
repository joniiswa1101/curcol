import { useState, useRef, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { useRoute, useLocation } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/AppLayout"
import {
  useListConversations,
  useListMessages,
  useSendMessage,
  getListMessagesQueryKey,
  getListConversationsQueryKey,
  Conversation
} from "@workspace/api-client-react"
import { useAuthStore } from "@/hooks/use-auth"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatMessageTime, getStatusLabel } from "@/lib/utils"
import {
  Search, Send, Paperclip, Smile, MoreVertical,
  Hash, Info, MessageSquare, X, FileText, Image as ImageIcon
} from "lucide-react"

// ─── Emoji Picker ─────────────────────────────────────────────────────────────

const EMOJI_CATEGORIES = [
  {
    label: "Smileys", emojis: [
      "😀","😂","😍","😎","😭","😤","😱","🥳","😴","🤔","😅","😇","🥺","😏",
      "😒","😬","🤗","🤩","🥰","😋","😜","🤣","😔","😤","😢","🤯","🥴","😈"
    ]
  },
  {
    label: "Gestures", emojis: [
      "👍","👎","👌","✌️","🤞","🙏","🤝","👏","🤙","💪","👋","✋","🖐️","☝️",
      "👆","👇","👉","👈","🤜","🤛","👊","✊","🤚","🖖"
    ]
  },
  {
    label: "Objects", emojis: [
      "❤️","🔥","⭐","💯","✅","❌","⚡","🎉","🎊","🎯","💡","📌","🔔","💬",
      "📎","🗂️","📁","💼","⏰","📱","💻","🖥️","📷","🎵","🎶"
    ]
  },
  {
    label: "Nature", emojis: [
      "🌞","🌙","🌈","🌊","🌸","🌺","🌻","🍀","🌿","🌱","🍁","❄️","⛅","🌤️",
      "🐶","🐱","🐻","🦁","🐯","🦊","🐺","🦋","🐝","🌾"
    ]
  },
]

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-16 left-0 w-72 bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden"
    >
      {/* Category tabs */}
      <div className="flex border-b border-border">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeTab === i
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-3 grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
        {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, i) => (
          <button
            key={i}
            onClick={() => { onSelect(emoji); onClose() }}
            className="text-xl hover:bg-muted rounded-lg p-1 transition-colors leading-none"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Attachment preview ────────────────────────────────────────────────────────

interface UploadedFile {
  id: number
  fileName: string
  fileSize: number
  mimeType: string
  url: string
  localUrl?: string
}

function AttachmentPreview({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const isImage = file.mimeType.startsWith("image/")
  const sizeMB = (file.fileSize / 1024 / 1024).toFixed(2)

  return (
    <div className="flex items-center gap-2 bg-muted/60 border border-border/50 rounded-xl px-3 py-2 text-sm max-w-xs">
      {isImage && file.localUrl ? (
        <img src={file.localUrl} alt={file.fileName} className="w-8 h-8 rounded object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
          {isImage ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-xs">{file.fileName}</p>
        <p className="text-[10px] text-muted-foreground">{sizeMB} MB</p>
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Main Chat page ────────────────────────────────────────────────────────────

export default function Chat() {
  const [match, params] = useRoute("/chat/:id")
  const activeId = match ? parseInt(params.id) : null

  const { data: convData, isLoading: convLoading } = useListConversations()
  const conversations = convData?.conversations || []
  const activeConversation = activeId ? conversations.find(c => c.id === activeId) ?? null : null

  return (
    <AppLayout>
      <div className="flex h-full w-full bg-background">
        {/* Sidebar */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 border-r border-border bg-card/30 flex flex-col",
          match ? "hidden md:flex" : "flex"
        )}>
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold">Messages</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search chats..." className="pl-9 bg-background border-none shadow-inner" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {convLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="flex gap-3 p-3 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                </div>
              ))
            ) : conversations.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <p>No conversations yet.</p>
              </div>
            ) : (
              conversations.map(conv => (
                <ConversationItem key={conv.id} conversation={conv} isActive={activeId === conv.id} />
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn("flex-1 flex flex-col bg-background relative", !match && "hidden md:flex")}>
          {activeId ? (
            <ChatThread conversationId={activeId} conversation={activeConversation} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <MessageSquare className="w-10 h-10 text-primary opacity-50" />
              </div>
              <h3 className="text-2xl font-display font-bold text-foreground">Select a conversation</h3>
              <p className="mt-2">Choose an existing chat or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Conversation list item ────────────────────────────────────────────────────

function ConversationItem({ conversation, isActive }: { conversation: Conversation; isActive: boolean }) {
  const { user } = useAuthStore()
  const [, navigate] = useLocation()

  let displayName = conversation.name
  let displayAvatar = conversation.avatarUrl
  let cicoStatus = null

  if (conversation.type === "direct" && conversation.members) {
    const other = conversation.members.find(m => m.userId !== user?.id)
    if (other?.user) {
      displayName = other.user.name
      displayAvatar = other.user.avatarUrl
      cicoStatus = other.user.cicoStatus?.status
    }
  }

  return (
    <button
      onClick={() => navigate(`/chat/${conversation.id}`)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 cursor-pointer text-left",
        isActive ? "bg-primary/10 shadow-sm" : "hover:bg-muted/50"
      )}
    >
      <div className="relative shrink-0">
        {conversation.type === "group" ? (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">
            <Hash className="w-6 h-6" />
          </div>
        ) : (
          <Avatar src={displayAvatar} fallback={displayName || "U"} size="lg" status={cicoStatus as any} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-baseline mb-0.5">
          <h4 className={cn("text-sm font-semibold truncate", isActive ? "text-primary" : "text-foreground")}>
            {displayName || "Unnamed Chat"}
          </h4>
          {conversation.lastMessage && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
              {formatMessageTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground truncate flex-1">
            {conversation.lastMessage?.content || "No messages yet"}
          </p>
          {conversation.unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Chat thread ───────────────────────────────────────────────────────────────

function ChatThread({ conversationId, conversation }: { conversationId: number; conversation: Conversation | null }) {
  const queryClient = useQueryClient()
  const { user, token } = useAuthStore()
  const [inputText, setInputText] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesQueryKey = getListMessagesQueryKey(conversationId)
  const { data: msgData, isLoading: messagesLoading } = useListMessages(conversationId)
  const sendMutation = useSendMessage()
  const messages = msgData?.messages || []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    setInputText("")
    setPendingFile(null)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }, [conversationId])

  // ── File upload handler ────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()

      const localUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
      setPendingFile({ ...data, localUrl })
    } catch (err) {
      console.error("File upload error:", err)
    } finally {
      setUploading(false)
    }
  }, [token])

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if ((!text && !pendingFile) || sendMutation.isPending) return

    setInputText("")
    const fileToSend = pendingFile
    setPendingFile(null)

    const tempId = Date.now()
    const optimisticMessage = {
      id: tempId,
      conversationId,
      senderId: user?.id || 0,
      content: text || (fileToSend ? fileToSend.fileName : ""),
      type: fileToSend && fileToSend.mimeType.startsWith("image/") ? "image" : fileToSend ? "file" : "text" as const,
      createdAt: new Date().toISOString(),
      editedAt: null,
      isEdited: false,
      isPinned: false,
      replyToId: null,
      attachments: fileToSend ? [{ fileName: fileToSend.fileName, url: fileToSend.url, mimeType: fileToSend.mimeType }] : [],
      reactions: [],
      sender: user ? { ...user, cicoStatus: null } : null,
    }

    queryClient.setQueryData(messagesQueryKey, (old: any) => {
      if (!old) return { messages: [optimisticMessage], hasMore: false }
      return { ...old, messages: [...old.messages, optimisticMessage] }
    })

    sendMutation.mutate(
      {
        conversationId,
        data: {
          content: text || undefined,
          type: "text",
          attachmentIds: fileToSend ? [fileToSend.id] : undefined,
        } as any,
      },
      {
        onSuccess: (newMsg) => {
          queryClient.setQueryData(messagesQueryKey, (old: any) => {
            if (!old) return { messages: [newMsg], hasMore: false }
            return { ...old, messages: old.messages.map((m: any) => m.id === tempId ? newMsg : m) }
          })
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
        },
        onError: () => {
          queryClient.setQueryData(messagesQueryKey, (old: any) => {
            if (!old) return old
            return { ...old, messages: old.messages.filter((m: any) => m.id !== tempId) }
          })
          setInputText(text)
          if (fileToSend) setPendingFile(fileToSend)
        },
      }
    )
  }, [inputText, pendingFile, conversationId, user, sendMutation, queryClient, messagesQueryKey])

  // ── Header info ─────────────────────────────────────────────────────────────
  let headerName = conversation?.name || "Chat"
  let headerAvatar = conversation?.avatarUrl
  let cicoStatusStr: string | null = null
  let headerStatus: string | null = null

  if (conversation?.type === "direct" && conversation.members) {
    const other = conversation.members.find(m => m.userId !== user?.id)
    if (other?.user) {
      headerName = other.user.name || "Chat"
      headerAvatar = other.user.avatarUrl
      cicoStatusStr = other.user.cicoStatus?.status || null
      headerStatus = getStatusLabel(cicoStatusStr)
    }
  }

  const canSend = (inputText.trim().length > 0 || pendingFile !== null) && !sendMutation.isPending

  return (
    <>
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          {conversation?.type === "group" ? (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm">
              <Hash className="w-5 h-5" />
            </div>
          ) : (
            <Avatar src={headerAvatar} fallback={headerName} size="md" status={cicoStatusStr as any} />
          )}
          <div>
            <h3 className="font-bold text-foreground leading-tight">{headerName}</h3>
            {headerStatus && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className={cn("w-2 h-2 rounded-full", cicoStatusStr === "present" ? "bg-status-present" : "bg-muted-foreground")} />
                {headerStatus}
              </p>
            )}
            {conversation?.type === "group" && (
              <p className="text-xs text-muted-foreground mt-0.5">{conversation.memberCount} members</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Search className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Info className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gradient-to-b from-background to-muted/20">
        {messagesLoading ? (
          <div className="space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className={cn("flex gap-3 animate-pulse", i % 2 === 0 ? "flex-row-reverse" : "")}>
                <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                <div className={cn("space-y-1", i % 2 === 0 ? "items-end flex flex-col" : "")}>
                  <div className="h-3 bg-muted rounded w-16" />
                  <div className="h-10 bg-muted rounded-2xl w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg, i, arr) => {
            const isMe = msg.senderId === user?.id
            const prevMsg = arr[i - 1]
            const showSender = !isMe && (i === 0 || prevMsg?.senderId !== msg.senderId)
            const isOptimistic = typeof msg.id === "number" && msg.id > 1_000_000_000_000

            const attachments = (msg as any).attachments || []
            const imageAttachments = attachments.filter((a: any) => a.mimeType?.startsWith("image/"))
            const fileAttachments = attachments.filter((a: any) => !a.mimeType?.startsWith("image/"))

            return (
              <div key={msg.id} className={cn("flex gap-3 max-w-[85%]", isMe ? "ml-auto flex-row-reverse" : "")}>
                {!isMe && (
                  <div className="w-8 shrink-0 flex flex-col justify-end">
                    {showSender && (
                      <Avatar src={msg.sender?.avatarUrl} fallback={msg.sender?.name || "?"} size="sm" />
                    )}
                  </div>
                )}

                <div className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
                  {showSender && (
                    <span className="text-xs font-medium text-muted-foreground ml-1">{msg.sender?.name}</span>
                  )}

                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl relative group shadow-sm text-sm transition-opacity min-w-[80px]",
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border/50 text-foreground rounded-bl-sm",
                    isOptimistic && "opacity-60"
                  )}>
                    {/* Image attachments */}
                    {imageAttachments.map((att: any, idx: number) => (
                      <img
                        key={idx}
                        src={att.url}
                        alt={att.fileName}
                        className="rounded-xl mb-2 max-w-[200px] max-h-[200px] object-cover cursor-pointer"
                        onClick={() => window.open(att.url, "_blank")}
                      />
                    ))}

                    {/* File attachments */}
                    {fileAttachments.map((att: any, idx: number) => (
                      <a
                        key={idx}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3 py-2 mb-2 transition-colors",
                          isMe ? "bg-white/10 hover:bg-white/20" : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="text-xs truncate max-w-[150px]">{att.fileName}</span>
                      </a>
                    ))}

                    {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                    <span className={cn(
                      "text-[10px] mt-1 block opacity-70",
                      isMe ? "text-right" : "text-left"
                    )}>
                      {format(new Date(msg.createdAt), "HH:mm")}
                      {msg.isEdited && " (edited)"}
                    </span>

                    <div className={cn(
                      "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border shadow-md rounded-lg flex items-center p-1",
                      isMe ? "-left-12" : "-right-12"
                    )}>
                      <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground">
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        {/* File preview above input */}
        {pendingFile && (
          <div className="mb-2 pl-1">
            <AttachmentPreview file={pendingFile} onRemove={() => setPendingFile(null)} />
          </div>
        )}

        <div className="relative">
          {showEmoji && (
            <EmojiPicker
              onSelect={(emoji) => {
                setInputText(prev => prev + emoji)
                textareaRef.current?.focus()
              }}
              onClose={() => setShowEmoji(false)}
            />
          )}

          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 bg-card border border-border/60 rounded-2xl p-2 shadow-sm focus-within:ring-2 ring-primary/20 transition-all"
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
              onChange={handleFileSelect}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "shrink-0 rounded-xl transition-colors",
                uploading ? "opacity-50" : "text-muted-foreground hover:text-primary"
              )}
              title="Attach file"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowEmoji(v => !v)}
              className={cn(
                "shrink-0 rounded-xl transition-colors",
                showEmoji ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary"
              )}
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </Button>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={pendingFile ? "Add a caption..." : "Type a message..."}
              rows={1}
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 px-2 text-sm custom-scrollbar"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend(e as any)
                }
              }}
            />

            <Button
              type="submit"
              disabled={!canSend}
              size="icon"
              className="shrink-0 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-transform active:scale-95"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </form>
        </div>
      </div>
    </>
  )
}
