import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import { useRoute } from "wouter"
import { AppLayout } from "@/components/layout/AppLayout"
import { 
  useListConversations, 
  useGetConversation, 
  useListMessages, 
  useSendMessage,
  useAuth,
  Conversation
} from "@workspace/api-client-react"
import { useAuthStore } from "@/hooks/use-auth"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatMessageTime, formatTimeAgo, getStatusLabel } from "@/lib/utils"
import { Search, Send, Paperclip, Smile, MoreVertical, Hash, Info, MessageSquare, Phone } from "lucide-react"

export default function Chat() {
  const [match, params] = useRoute("/chat/:id")
  const activeId = match ? parseInt(params.id) : null
  const { user } = useAuthStore()

  // Data fetching
  const { data: convData, isLoading: convLoading } = useListConversations()
  const conversations = convData?.conversations || []

  return (
    <AppLayout>
      <div className="flex h-full w-full bg-background">
        {/* Conversations Sidebar */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 border-r border-border bg-card/30 flex flex-col transition-all duration-300",
          match ? "hidden md:flex" : "flex"
        )}>
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold">Messages</h2>
              <Button variant="ghost" size="icon" className="rounded-full bg-primary/5 text-primary">
                <Search className="w-4 h-4" />
              </Button>
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
                <ConversationItem 
                  key={conv.id} 
                  conversation={conv} 
                  isActive={activeId === conv.id} 
                />
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col bg-background relative",
          !match && "hidden md:flex"
        )}>
          {activeId ? (
            <ChatThread conversationId={activeId} />
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

function ConversationItem({ conversation, isActive }: { conversation: Conversation, isActive: boolean }) {
  const { user } = useAuthStore()
  
  // Logic to get correct display name/avatar for direct chats
  let displayName = conversation.name
  let displayAvatar = conversation.avatarUrl
  let cicoStatus = null

  if (conversation.type === "direct" && conversation.members) {
    const otherMember = conversation.members.find(m => m.userId !== user?.id)
    if (otherMember?.user) {
      displayName = otherMember.user.name
      displayAvatar = otherMember.user.avatarUrl
      cicoStatus = otherMember.user.cicoStatus?.status
    }
  }

  return (
    <a 
      href={`/chat/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer",
        isActive 
          ? "bg-primary/10 shadow-sm" 
          : "hover:bg-muted/50"
      )}
    >
      <div className="relative">
        {conversation.type === "group" ? (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">
            <Hash className="w-6 h-6" />
          </div>
        ) : conversation.type === "whatsapp" ? (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold shadow-md">
            <Phone className="w-6 h-6" />
          </div>
        ) : (
          <Avatar 
            src={displayAvatar} 
            fallback={displayName || "U"} 
            size="lg" 
            status={cicoStatus as any} 
          />
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
    </a>
  )
}

function ChatThread({ conversationId }: { conversationId: number }) {
  const { data: convData } = useGetConversation(conversationId)
  const { data: msgData, isLoading } = useListMessages(conversationId)
  const sendMutation = useSendMessage()
  const { user } = useAuthStore()
  
  const [inputText, setInputText] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()

  const messages = msgData?.messages || []

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle typing indicator on input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    
    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    
    // Send typing indicator
    if (e.target.value.trim()) {
      fetch(`/api/messages/${conversationId}/typing`, { method: 'POST' }).catch(() => {})
      
      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        fetch(`/api/messages/${conversationId}/typing/stop`, { method: 'POST' }).catch(() => {})
      }, 2000)
    } else {
      // Stop typing if input is empty
      fetch(`/api/messages/${conversationId}/typing/stop`, { method: 'POST' }).catch(() => {})
    }
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || sendMutation.isPending) return

    sendMutation.mutate({
      conversationId,
      data: { content: inputText, type: "text" }
    }, {
      onSuccess: () => setInputText("")
    })
  }

  if (!convData) return null

  // Determine header info
  let headerName = convData.name
  let headerAvatar = convData.avatarUrl
  let headerStatus = null
  let cicoStatusStr = null

  if (convData.type === "direct" && convData.members) {
    const otherMember = convData.members.find(m => m.userId !== user?.id)
    if (otherMember?.user) {
      headerName = otherMember.user.name
      headerAvatar = otherMember.user.avatarUrl
      cicoStatusStr = otherMember.user.cicoStatus?.status
      headerStatus = getStatusLabel(cicoStatusStr)
    }
  }

  return (
    <>
      {/* Thread Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          {convData.type === "group" ? (
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm">
             <Hash className="w-5 h-5" />
           </div>
          ) : convData.type === "whatsapp" ? (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold shadow-sm">
              <Phone className="w-5 h-5" />
            </div>
          ) : (
            <Avatar src={headerAvatar} fallback={headerName || "U"} size="md" status={cicoStatusStr as any} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground leading-tight">{headerName || "Chat"}</h3>
              {convData.type === "whatsapp" && (
                <span className="text-[10px] bg-green-500/10 text-green-600 border border-green-500/20 px-2 py-0.5 rounded-full font-semibold">WhatsApp</span>
              )}
            </div>
            {headerStatus && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className={cn("w-2 h-2 rounded-full", cicoStatusStr === 'present' ? 'bg-status-present' : 'bg-muted-foreground')} />
                {headerStatus}
              </p>
            )}
            {convData.type === 'group' && (
              <p className="text-xs text-muted-foreground mt-0.5">{convData.memberCount} members</p>
            )}
            {convData.type === 'whatsapp' && (convData as any).whatsappContactPhone && (
              <p className="text-xs text-muted-foreground mt-0.5">+{(convData as any).whatsappContactPhone}</p>
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-background to-muted/20">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          messages.slice().reverse().map((msg, i, arr) => {
            const isMe = msg.senderId === user?.id;
            const showAvatar = !isMe && (i === 0 || arr[i-1].senderId !== msg.senderId);
            
            return (
              <div key={msg.id} className={cn("flex gap-3 max-w-[85%]", isMe ? "ml-auto flex-row-reverse" : "")}>
                {/* Avatar Column */}
                {!isMe && (
                  <div className="w-8 shrink-0 flex flex-col justify-end">
                    {showAvatar && (
                      <Avatar src={msg.sender?.avatarUrl} fallback={msg.sender?.name || "?"} size="sm" />
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
                  {showAvatar && (
                    <span className="text-xs font-medium text-muted-foreground ml-1">
                      {msg.sender?.name}
                    </span>
                  )}
                  
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl relative group shadow-sm text-sm",
                    isMe 
                      ? "bg-primary text-primary-foreground rounded-br-sm" 
                      : (msg as any).isFromWhatsapp
                        ? "bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50 text-foreground rounded-bl-sm"
                        : "bg-card border border-border/50 text-foreground rounded-bl-sm"
                  )}>
                    {(msg as any).isFromWhatsapp && (
                      <span className="text-[9px] text-green-600 dark:text-green-400 font-semibold flex items-center gap-1 mb-1">
                        <Phone className="w-2.5 h-2.5" /> WhatsApp
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    
                    {/* Timestamp */}
                    <span className={cn(
                      "text-[10px] mt-1 block opacity-70",
                      isMe ? "text-right" : "text-left"
                    )}>
                      {format(new Date(msg.createdAt), 'HH:mm')}
                      {msg.isEdited && " (edited)"}
                    </span>

                    {/* Action Menu (Hover) */}
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
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{Array.from(typingUsers).length} {Array.from(typingUsers).length === 1 ? 'person is' : 'people are'} typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        <form onSubmit={handleSend} className="flex items-end gap-2 bg-card border border-border/60 rounded-2xl p-2 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
          <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary rounded-xl">
            <Paperclip className="w-5 h-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary rounded-xl">
            <Smile className="w-5 h-5" />
          </Button>
          
          <textarea
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 px-2 text-sm custom-scrollbar"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />

          <Button 
            type="submit" 
            disabled={!inputText.trim() || sendMutation.isPending}
            size="icon" 
            className="shrink-0 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-transform active:scale-95"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </form>
      </div>
    </>
  )
}
