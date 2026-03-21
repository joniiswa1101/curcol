import { useState, useRef, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { useRoute, useLocation } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/AppLayout"
import {
  useListConversations,
  useListMessages,
  useSendMessage,
  useListUsers,
  getListMessagesQueryKey,
  getListConversationsQueryKey,
  Conversation
} from "@workspace/api-client-react"
import { useAuthStore } from "@/hooks/use-auth"
import { useInfiniteMessages } from "@/hooks/use-infinite-messages"
import { useReadReceipts } from "@/hooks/use-read-receipts"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatMessageTime, getStatusLabel } from "@/lib/utils"
import { validateFile } from "@/lib/upload-config"
import {
  Search, Send, Paperclip, Smile, MoreVertical, Mic, Reply,
  Hash, Info, MessageSquare, X, FileText, Image as ImageIcon, AlertCircle,
  Phone, Video, Pin, Heart, Users, Plus, UserPlus, Crown, Shield,
  ShieldOff, LogOut, Trash2, BellOff, Bell, Settings, Check
} from "lucide-react"
import { VoiceRecorder } from "@/components/voice/VoiceRecorder"
import { AudioPlayer } from "@/components/voice/AudioPlayer"
import { useOfflineQueue } from "@/hooks/use-offline-queue"
import { useQueueSync } from "@/hooks/use-queue-sync"
import { useTypingIndicators } from "@/hooks/use-typing-indicators"
import { useCall } from "@/contexts/CallContext"
import { usePresenceContext, formatLastSeen } from "@/contexts/PresenceContext"

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

// ─── Create Group Dialog ────────────────────────────────────────────────────────

function CreateGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (convId: number) => void }) {
  const { token } = useAuthStore()
  const { data: usersData } = useListUsers()
  const { user: currentUser } = useAuthStore()
  const [groupName, setGroupName] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allUsers = (usersData as any)?.users || usersData || []
  const filteredUsers = allUsers.filter((u: any) =>
    u.id !== currentUser?.id &&
    u.isActive !== false &&
    (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const toggleUser = (userId: number) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleCreate = async () => {
    if (!groupName.trim()) { setError("Nama grup harus diisi"); return }
    if (selectedUsers.length === 0) { setError("Pilih minimal 1 anggota"); return }

    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "group", name: groupName.trim(), memberIds: selectedUsers }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || "Gagal membuat grup")
      }
      const conv = await res.json()
      onCreated(conv.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat grup")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-bold">Buat Grup Baru</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nama Grup</label>
            <Input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Contoh: Tim Marketing"
              className="bg-background"
              autoFocus
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Tambah Anggota {selectedUsers.length > 0 && <span className="text-primary">({selectedUsers.length} dipilih)</span>}
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari karyawan..."
                className="pl-9 bg-background"
              />
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedUsers.map(uid => {
                  const u = allUsers.find((u: any) => u.id === uid)
                  return (
                    <span key={uid} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
                      {u?.name || "Unknown"}
                      <button onClick={() => toggleUser(uid)} className="hover:text-primary/70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[280px]">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada karyawan ditemukan</p>
              ) : (
                filteredUsers.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left",
                      selectedUsers.includes(u.id) ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                    )}
                  >
                    <Avatar src={u.avatarUrl} fallback={u.name || "U"} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.department || u.position || u.email}</p>
                    </div>
                    {selectedUsers.includes(u.id) && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selectedUsers.length === 0}
            className="flex-1"
          >
            {creating ? "Membuat..." : "Buat Grup"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Member Row ──────────────────────────────────────────────────────────────────

function MemberRow({ member, isCreator, isMe, canManage, onPromote, onDemote, onRemove }: {
  member: any; isCreator: boolean; isMe: boolean; canManage: boolean;
  onPromote: () => void; onDemote: () => void; onRemove: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false)
  const isMemberAdmin = member.role === "admin"

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/50 transition-colors group relative">
      <Avatar src={member.user?.avatarUrl} fallback={member.user?.name || "U"} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{member.user?.name || "Unknown"}</span>
          {isMe && <span className="text-[10px] text-muted-foreground">(Anda)</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {isCreator && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <Crown className="w-3 h-3" /> Pembuat
            </span>
          )}
          {isMemberAdmin && !isCreator && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              <Shield className="w-3 h-3" /> Admin
            </span>
          )}
          {member.user?.department && (
            <span className="text-[10px] text-muted-foreground">{member.user.department}</span>
          )}
        </div>
      </div>

      {canManage && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-50 bg-popover border border-border shadow-lg rounded-lg py-1 min-w-[160px]">
                {isMemberAdmin ? (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    onClick={() => { onDemote(); setShowMenu(false) }}
                  >
                    <ShieldOff className="w-3.5 h-3.5" /> Cabut Admin
                  </button>
                ) : (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    onClick={() => { onPromote(); setShowMenu(false) }}
                  >
                    <Shield className="w-3.5 h-3.5" /> Jadikan Admin
                  </button>
                )}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-destructive/10 text-destructive transition-colors text-left"
                  onClick={() => { onRemove(); setShowMenu(false) }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Keluarkan
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group Info Panel ────────────────────────────────────────────────────────────

function GroupInfoPanel({
  conversation, onClose, onNavigate
}: {
  conversation: any;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const { token, user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const { data: usersData } = useListUsers()
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedNewMembers, setSelectedNewMembers] = useState<number[]>([])
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(conversation?.name || "")
  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [members, setMembers] = useState<any[]>(conversation?.members || [])

  const myMembership = members.find((m: any) => m.userId === currentUser?.id)
  const isAdmin = myMembership?.role === "admin"
  const isCreator = conversation?.createdById === currentUser?.id

  useEffect(() => {
    fetchMembers()
  }, [conversation?.id])

  const fetchMembers = async () => {
    if (!conversation?.id) return
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.members) setMembers(data.members)
    } catch (err) { console.error("Fetch members error:", err) }
  }

  const allUsers = (usersData as any)?.users || usersData || []
  const memberIds = new Set(members.map((m: any) => m.userId))
  const nonMembers = allUsers.filter((u: any) =>
    u.id !== currentUser?.id &&
    !memberIds.has(u.id) &&
    u.isActive !== false &&
    (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     u.department?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleAddMembers = async () => {
    if (selectedNewMembers.length === 0) return
    setLoading(true)
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: selectedNewMembers }),
      })
      if (!res.ok) return
      setSelectedNewMembers([])
      setShowAddMembers(false)
      setSearchTerm("")
      await fetchMembers()
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleRemoveMember = async (userId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      await fetchMembers()
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    } catch (err) { console.error(err) }
  }

  const handlePromote = async (userId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members/${userId}/promote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      await fetchMembers()
    } catch (err) { console.error(err) }
  }

  const handleDemote = async (userId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members/${userId}/demote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      await fetchMembers()
    } catch (err) { console.error(err) }
  }

  const handleLeave = async () => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      onNavigate("/chat")
      onClose()
    } catch (err) { console.error(err) }
  }

  const handleDeleteGroup = async () => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      onNavigate("/chat")
      onClose()
    } catch (err) { console.error(err) }
  }

  const handleUpdateName = async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) return
      setEditingName(false)
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    } catch (err) { console.error(err) }
  }

  const handleMuteToggle = async () => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/mute`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    } catch (err) { console.error(err) }
  }

  const sortedMembers = [...members].sort((a, b) => {
    if (a.userId === conversation?.createdById) return -1
    if (b.userId === conversation?.createdById) return 1
    if (a.role === "admin" && b.role !== "admin") return -1
    if (a.role !== "admin" && b.role === "admin") return 1
    return 0
  })

  return (
    <div className="w-80 border-l border-border bg-card/50 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h4 className="font-bold text-sm">Info Grup</h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 flex flex-col items-center border-b border-border">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg mb-3">
            <Hash className="w-10 h-10" />
          </div>
          {editingName ? (
            <div className="flex items-center gap-2 w-full">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="text-center text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleUpdateName(); if (e.key === "Escape") setEditingName(false) }}
              />
              <Button size="sm" onClick={handleUpdateName}><Check className="w-3 h-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}><X className="w-3 h-3" /></Button>
            </div>
          ) : (
            <h3 className="font-bold text-lg text-center group flex items-center gap-2">
              {conversation?.name}
              {isAdmin && (
                <button onClick={() => { setNewName(conversation?.name || ""); setEditingName(true) }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </h3>
          )}
          <p className="text-xs text-muted-foreground mt-1">{members.length} anggota</p>
        </div>

        <div className="p-3 border-b border-border space-y-1">
          <button
            onClick={handleMuteToggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors"
          >
            {conversation?.isMuted ? <Bell className="w-4 h-4 text-muted-foreground" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
            <span>{conversation?.isMuted ? "Aktifkan Notifikasi" : "Bisukan Notifikasi"}</span>
          </button>
          {!isCreator && (
            <button
              onClick={handleLeave}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-destructive/10 text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar Grup</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-destructive/10 text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Grup</span>
            </button>
          )}
        </div>

        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anggota ({members.length})</h5>
            {isAdmin && (
              <button
                onClick={() => setShowAddMembers(!showAddMembers)}
                className="text-primary hover:text-primary/80 transition-colors"
                title="Tambah Anggota"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
          </div>

          {showAddMembers && (
            <div className="mb-3 p-3 bg-muted/30 rounded-xl border border-border/50 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cari karyawan..."
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {nonMembers.slice(0, 20).map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedNewMembers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                    className={cn(
                      "w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors text-xs",
                      selectedNewMembers.includes(u.id) ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <Avatar src={u.avatarUrl} fallback={u.name || "U"} size="xs" />
                    <span className="truncate flex-1">{u.name}</span>
                    {selectedNewMembers.includes(u.id) && <Check className="w-3 h-3 text-primary" />}
                  </button>
                ))}
              </div>
              {selectedNewMembers.length > 0 && (
                <Button size="sm" onClick={handleAddMembers} disabled={loading} className="w-full h-7 text-xs">
                  {loading ? "Menambahkan..." : `Tambah ${selectedNewMembers.length} Anggota`}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-0.5">
            {sortedMembers.map((m: any) => (
              <MemberRow
                key={m.userId}
                member={m}
                isCreator={m.userId === conversation?.createdById}
                isMe={m.userId === currentUser?.id}
                canManage={isAdmin && m.userId !== currentUser?.id && m.userId !== conversation?.createdById}
                onPromote={() => handlePromote(m.userId)}
                onDemote={() => handleDemote(m.userId)}
                onRemove={() => handleRemoveMember(m.userId)}
              />
            ))}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full">
            <h4 className="font-bold text-lg mb-2">Hapus Grup?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Semua pesan akan dihapus permanen dan tidak bisa dikembalikan.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1">Batal</Button>
              <Button variant="destructive" onClick={handleDeleteGroup} className="flex-1">Hapus</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Chat page ────────────────────────────────────────────────────────────

export default function Chat() {
  const [match, params] = useRoute("/chat/:id")
  const activeId = match ? parseInt(params.id) : null
  const { getUserPresence } = usePresenceContext()
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data: convData, isLoading: convLoading } = useListConversations()
  const conversations = convData?.conversations || []
  const activeConversation = activeId ? conversations.find(c => c.id === activeId) ?? null : null

  return (
    <AppLayout>
      <div className="flex h-full w-full bg-background overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "flex-shrink-0 w-full md:w-80 lg:w-96 border-r border-border bg-card/30 flex flex-col",
          match ? "hidden md:flex" : "flex"
        )}>
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold">Messages</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateGroup(true)}
                className="text-muted-foreground hover:text-primary"
                title="Buat Grup Baru"
              >
                <Users className="w-5 h-5" />
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
                <ConversationItem key={conv.id} conversation={conv} isActive={activeId === conv.id} getUserPresence={getUserPresence} />
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn("flex-1 flex flex-col bg-background relative min-w-0", !match && "hidden md:flex")}>
          {activeId ? (
            <ChatThread conversationId={activeId} conversation={activeConversation} getUserPresence={getUserPresence} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <MessageSquare className="w-10 h-10 text-primary opacity-50" />
              </div>
              <h3 className="text-2xl font-display font-bold text-foreground">Select a conversation</h3>
              <p className="mt-2">Choose an existing chat or start a new one</p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setShowCreateGroup(true)}
              >
                <Users className="w-4 h-4" />
                Buat Grup Baru
              </Button>
            </div>
          )}
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupDialog
          onClose={() => setShowCreateGroup(false)}
          onCreated={(convId) => {
            setShowCreateGroup(false)
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
            navigate(`/chat/${convId}`)
          }}
        />
      )}
    </AppLayout>
  )
}

// ─── Conversation list item ────────────────────────────────────────────────────

function ConversationItem({ conversation, isActive, getUserPresence }: { conversation: Conversation; isActive: boolean; getUserPresence: (userId: number) => { status: string; lastSeenAt: string | null } }) {
  const { user } = useAuthStore()
  const [, navigate] = useLocation()

  let displayName = conversation.name
  let displayAvatar = conversation.avatarUrl
  let cicoStatus = null
  let otherUserId: number | null = null

  if (conversation.type === "direct" && conversation.members) {
    const other = conversation.members.find(m => m.userId !== user?.id)
    if (other?.user) {
      displayName = other.user.name
      displayAvatar = other.user.avatarUrl
      cicoStatus = other.user.cicoStatus?.status
      otherUserId = other.userId || null
    }
  }

  const presence = otherUserId ? getUserPresence(otherUserId) : null
  const presenceDotColor = presence?.status === "online" ? "bg-green-500" : presence?.status === "idle" ? "bg-yellow-500" : null

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
        ) : conversation.type === "whatsapp" ? (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#075E54] to-[#128C7E] flex items-center justify-center text-white font-bold shadow-md">
            <span className="text-lg">💬</span>
          </div>
        ) : (
          <Avatar src={displayAvatar} fallback={displayName || "U"} size="lg" status={cicoStatus as any} />
        )}
        {presenceDotColor && conversation.type === "direct" && (
          <span className={cn("absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background", presenceDotColor)} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-baseline mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className={cn("text-sm font-semibold truncate", isActive ? "text-primary" : "text-foreground")}>
              {displayName || "Unnamed Chat"}
            </h4>
            {conversation.type === "whatsapp" && (
              <span className="text-[10px] font-semibold text-white bg-[#075E54] px-2 py-0.5 rounded-full shrink-0">WhatsApp</span>
            )}
          </div>
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
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 min-w-[20px] text-center">
              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Chat thread ───────────────────────────────────────────────────────────────

function ChatThread({ conversationId, conversation, getUserPresence }: { conversationId: number; conversation: Conversation | null; getUserPresence: (userId: number) => { status: string; lastSeenAt: string | null } }) {
  const queryClient = useQueryClient()
  const { user, token } = useAuthStore()
  const [, navigate] = useLocation()
  const [inputText, setInputText] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [replyToMessage, setReplyToMessage] = useState<any>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: any } | null>(null)
  const [showPinned, setShowPinned] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchFilters, setSearchFilters] = useState<{ senderId?: number; before?: string; after?: string }>({})
  const [linkPreviews, setLinkPreviews] = useState<Record<number, any>>({})
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use infinite scroll pagination with caching
  const { messages, isLoading: messagesLoading, isLoadingMore, hasMore, loadOlderMessages } = useInfiniteMessages({
    conversationId,
    initialLimit: 50,
  })

  const sendMutation = useSendMessage()
  const { markMessageAsRead, markConversationAsRead } = useReadReceipts(conversationId)
  const { isOnline, queuedCount, enqueue, getQueuedMessages } = useOfflineQueue(conversationId)
  const { typingUsers, sendTyping } = useTypingIndicators(conversationId)
  const callCtx = useCall()
  useQueueSync()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollContainerRef.current && messages.length > 0) {
      const shouldAutoScroll = 
        scrollContainerRef.current.scrollHeight - scrollContainerRef.current.scrollTop - scrollContainerRef.current.clientHeight < 100
      if (shouldAutoScroll) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 0)
      }
    }
  }, [messages.length])

  // Reset state when conversation changes
  useEffect(() => {
    setInputText("")
    setPendingFile(null)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }, [conversationId])

  const messagesQueryKey = getListMessagesQueryKey(conversationId)

  // Polling fallback - refetch messages every 3 seconds as backup to WebSocket
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey })
    }, 3000)
    return () => clearInterval(interval)
  }, [conversationId, queryClient, messagesQueryKey])

  // Detect scroll to top and load older messages, and auto-mark visible messages as read
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    // When scrolled near the top (100px), load older messages
    if (scrollTop < 100 && hasMore && !isLoadingMore) {
      loadOlderMessages()
    }
    
    // Auto-mark visible messages as read (P3.6)
    const visibleMessages = scrollContainerRef.current.querySelectorAll("[data-message-id]")
    visibleMessages.forEach(el => {
      const rect = el.getBoundingClientRect()
      const containerRect = scrollContainerRef.current!.getBoundingClientRect()
      // Check if message is in viewport
      if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) {
        const msgId = parseInt(el.getAttribute("data-message-id") || "0")
        if (msgId > 0) {
          markMessageAsRead(msgId)
        }
      }
    })
  }, [hasMore, isLoadingMore, loadOlderMessages, markMessageAsRead])

  // ── File upload handler ────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploadError(null)

    // Client-side validation first
    const validation = validateFile(file)
    if (!validation.valid) {
      setUploadError(validation.error || "File tidak valid")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Upload gagal" }))
        throw new Error(errorData.message || "Upload gagal")
      }
      const data = await res.json()

      const localUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
      setPendingFile({ ...data, localUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload gagal"
      setUploadError(message)
      console.error("File upload error:", err)
    } finally {
      setUploading(false)
    }
  }, [token])

  // ── Search messages ───────────────────────────────────────────────────────
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        limit: "50",
        ...(searchFilters.senderId && { senderId: searchFilters.senderId.toString() }),
        ...(searchFilters.before && { before: searchFilters.before }),
        ...(searchFilters.after && { after: searchFilters.after }),
      })
      const response = await fetch(`/api/conversations/${conversationId}/search?${params}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
      const data = await response.json()
      setSearchResults(data.messages || [])
    } catch (err) {
      console.error("Search error:", err)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery, searchFilters, conversationId, token])

  // ── URL detection ─────────────────────────────────────────────────────────
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\][\w-]+(:[0-9]+)?(\/[^\s<>"{}|\\^`\]\)]*)?/g;
  
  const detectUrls = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches = text.match(urlRegex) || [];
    return [...new Set(matches)];
  }, []);

  // ── Detect and fetch link previews ─────────────────────────────────────────
  const fetchLinkPreview = useCallback(async (msgId: number, url: string) => {
    if (linkPreviews[msgId]) return;
    try {
      const response = await fetch("/api/messages/link-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      });
      if (!response.ok) return;
      const preview = await response.json();
      setLinkPreviews(prev => ({ ...prev, [msgId]: preview }));
    } catch (err) {
      console.error("Link preview fetch error:", err);
    }
  }, [linkPreviews, token]);

  // ── Auto-fetch link previews on message render ──────────────────────────────
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.content) {
        const urls = detectUrls(msg.content);
        urls.forEach(url => {
          if (!linkPreviews[msg.id]) {
            fetchLinkPreview(msg.id, url);
          }
        });
      }
    });
  }, [messages, detectUrls, fetchLinkPreview, linkPreviews]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if ((!text && !pendingFile) || sendMutation.isPending) return

    setInputText("")
    const fileToSend = pendingFile
    setPendingFile(null)
    const currentReply = replyToMessage
    setReplyToMessage(null)

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
      replyToId: currentReply?.id || null,
      replyTo: currentReply ? { id: currentReply.id, content: currentReply.content, sender: currentReply.sender } : null,
      attachments: fileToSend ? [{ fileName: fileToSend.fileName, url: fileToSend.url, mimeType: fileToSend.mimeType }] : [],
      reactions: [],
      sender: user ? { ...user, cicoStatus: null } : null,
    }

    queryClient.setQueryData(messagesQueryKey, (old: any) => {
      if (!old) return { messages: [optimisticMessage], hasMore: false }
      return { ...old, messages: [...old.messages, optimisticMessage] }
    })

    if (!isOnline) {
      enqueue({
        conversationId,
        content: text || undefined,
        type: "text",
        replyToId: currentReply?.id || undefined,
        attachmentIds: fileToSend ? [fileToSend.id] : undefined,
      })
    } else {
      sendMutation.mutate(
        {
          conversationId,
          data: {
            content: text || undefined,
            type: "text",
            replyToId: currentReply?.id || undefined,
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
    }
  }, [inputText, pendingFile, conversationId, user, sendMutation, queryClient, messagesQueryKey, isOnline, enqueue, replyToMessage])

  const handleVoiceRecorded = useCallback(async (blob: Blob, duration: number) => {
    setShowVoiceRecorder(false)
    setUploading(true)
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm"
      const formData = new FormData()
      formData.append("file", blob, `voice-${Date.now()}.${ext}`)

      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Upload gagal" }))
        throw new Error(errorData.message || "Upload gagal")
      }
      const data = await res.json()

      const tempId = Date.now()
      const optimisticMessage = {
        id: tempId,
        conversationId,
        senderId: user?.id || 0,
        content: `🎤 Pesan suara (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`,
        type: "file" as const,
        createdAt: new Date().toISOString(),
        editedAt: null,
        isEdited: false,
        isPinned: false,
        replyToId: null,
        attachments: [{ fileName: data.fileName, url: data.url, mimeType: data.mimeType }],
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
            content: `🎤 Pesan suara (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`,
            type: "text",
            attachmentIds: [data.id],
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
          },
        }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload gagal"
      setUploadError(message)
    } finally {
      setUploading(false)
    }
  }, [token, conversationId, user, sendMutation, queryClient, messagesQueryKey])

  // ── Header info ─────────────────────────────────────────────────────────────
  let headerName = conversation?.name || "Chat"
  let headerAvatar = conversation?.avatarUrl
  let cicoStatusStr: string | null = null
  let headerStatus: string | null = null
  let otherUserId: number | null = null

  if (conversation?.type === "direct" && conversation.members) {
    const other = conversation.members.find(m => m.userId !== user?.id)
    if (other?.user) {
      headerName = other.user.name || "Chat"
      headerAvatar = other.user.avatarUrl
      cicoStatusStr = other.user.cicoStatus?.status || null
      headerStatus = getStatusLabel(cicoStatusStr)
      otherUserId = other.userId || null
    }
  }

  const otherPresence = otherUserId ? getUserPresence(otherUserId) : null
  const presenceStatus = otherPresence?.status || "offline"
  const presenceColor = presenceStatus === "online" ? "bg-green-500" : presenceStatus === "idle" ? "bg-yellow-500" : "bg-gray-400"
  const presenceLabel = presenceStatus === "online" ? "Online" : presenceStatus === "idle" ? "Idle" : formatLastSeen(otherPresence?.lastSeenAt || null)

  const canSend = (inputText.trim().length > 0 || pendingFile !== null) && !sendMutation.isPending

  const isWhatsapp = conversation?.type === "whatsapp"
  const isGroup = conversation?.type === "group"

  return (
    <div className="flex h-full w-full">
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className={cn(
        "h-16 border-b border-border flex items-center justify-between px-6 backdrop-blur-md sticky top-0 z-10",
        isWhatsapp ? "bg-gradient-to-r from-[#075E54] to-[#128C7E]" : "bg-card/50"
      )}>
        <div className="flex items-center gap-4">
          {conversation?.type === "group" ? (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm">
              <Hash className="w-5 h-5" />
            </div>
          ) : isWhatsapp ? (
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold shadow-sm">
              <span className="text-base">💬</span>
            </div>
          ) : (
            <Avatar src={headerAvatar} fallback={headerName} size="md" status={cicoStatusStr as any} />
          )}
          <div>
            <h3 className={cn("font-bold leading-tight", isWhatsapp ? "text-white" : "text-foreground")}>{headerName}</h3>
            {isWhatsapp ? (
              <p className="text-xs text-white/80 mt-0.5">💬 Replies forwarded to WhatsApp</p>
            ) : (
              <>
                {!isOnline && (
                  <p className="text-xs text-amber-500 flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Offline {queuedCount > 0 && `(${queuedCount} pending)`}
                  </p>
                )}
                {typingUsers.length > 0 ? (
                  <p className="text-xs text-blue-500 flex items-center gap-1.5 mt-0.5">
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" />
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </span>
                    {typingUsers.length === 1 ? "typing" : "typing"}
                  </p>
                ) : conversation?.type === "direct" && otherUserId ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className={cn("w-2 h-2 rounded-full", presenceColor)} />
                    {presenceLabel}
                    {headerStatus && presenceStatus !== "offline" && (
                      <span className="text-muted-foreground/60 ml-1">· {headerStatus}</span>
                    )}
                  </p>
                ) : headerStatus ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className={cn("w-2 h-2 rounded-full", cicoStatusStr === "present" ? "bg-status-present" : "bg-muted-foreground")} />
                    {headerStatus}
                  </p>
                ) : null}
                {conversation?.type === "group" && (
                  <p
                    className="text-xs text-muted-foreground mt-0.5 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setShowGroupInfo(!showGroupInfo)}
                  >
                    {conversation.memberCount} anggota · Klik untuk info
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn("text-muted-foreground hover:text-primary", showSearch && "text-primary bg-primary/10")}
            onClick={() => setShowSearch(!showSearch)}
            title="Search"
          >
            <Search className="w-5 h-5" />
          </Button>
          {conversation?.type === "direct" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary"
                onClick={() => {
                  const otherUser = conversation.members?.find((m: any) => m.id !== user?.id);
                  if (otherUser) {
                    callCtx.initiateCall({
                      userId: otherUser.id,
                      userName: otherUser.displayName || otherUser.employeeId,
                      userAvatar: otherUser.avatarUrl,
                      conversationId,
                      type: "voice",
                    });
                  }
                }}
              >
                <Phone className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary"
                onClick={() => {
                  const otherUser = conversation.members?.find((m: any) => m.id !== user?.id);
                  if (otherUser) {
                    callCtx.initiateCall({
                      userId: otherUser.id,
                      userName: otherUser.displayName || otherUser.employeeId,
                      userAvatar: otherUser.avatarUrl,
                      conversationId,
                      type: "video",
                    });
                  }
                }}
              >
                <Video className="w-5 h-5" />
              </Button>
            </>
          )}
          {conversation?.type === "group" && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-muted-foreground hover:text-primary", showGroupInfo && "text-primary bg-primary/10")}
              onClick={() => setShowGroupInfo(!showGroupInfo)}
              title="Info Grup"
            >
              <Users className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="border-b border-border bg-muted/30 p-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={searchLoading || !searchQuery.trim()}>
                {searchLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              <label className="flex items-center gap-1">
                <span>After:</span>
                <Input
                  type="date"
                  value={searchFilters.after || ""}
                  onChange={(e) => setSearchFilters(f => ({ ...f, after: e.target.value || undefined }))}
                  className="w-40 h-8"
                />
              </label>
              <label className="flex items-center gap-1">
                <span>Before:</span>
                <Input
                  type="date"
                  value={searchFilters.before || ""}
                  onChange={(e) => setSearchFilters(f => ({ ...f, before: e.target.value || undefined }))}
                  className="w-40 h-8"
                />
              </label>
            </div>
            {searchResults.length > 0 && (
              <p className="text-xs text-muted-foreground">Found {searchResults.length} result(s)</p>
            )}
          </form>
        </div>
      )}

      {showSearch && searchResults.length > 0 && (
        <div className="border-b border-border bg-muted/20 p-4 max-h-96 overflow-y-auto space-y-2">
          {searchResults.map((msg) => {
            const highlightedContent = msg.content ? msg.content.replace(
              new RegExp(`(${searchQuery})`, "gi"),
              '<mark style="background-color: #fbbf24; padding: 2px 4px; border-radius: 3px;">$1</mark>'
            ) : "";
            return (
              <div
                key={msg.id}
                className="bg-background border border-border/50 rounded p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const el = document.getElementById(`msg-${msg.id}`)
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" })
                    el.classList.add("ring-2", "ring-primary/50")
                    setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000)
                  }
                  setShowSearch(false)
                }}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-primary">{msg.sender?.name || "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(msg.createdAt), "dd MMM HH:mm")}</span>
                </div>
                <div 
                  className="text-xs text-foreground line-clamp-2 mt-1"
                  dangerouslySetInnerHTML={{ __html: highlightedContent }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        className={cn("flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gradient-to-b from-background to-muted/20", showSearch && "hidden")}
        onScroll={handleScroll}
      >
        {/* Pin indicator button */}
        {messages.some(m => m.isPinned) && !showPinned && (
          <button
            onClick={() => setShowPinned(true)}
            className="mx-auto px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full text-xs text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 w-fit"
          >
            <Pin className="w-3 h-3" />
            <span>{messages.filter(m => m.isPinned).length} pinned</span>
          </button>
        )}

        {/* Pinned messages section */}
        {showPinned && (
          <div className="border-b border-border bg-muted/30 p-3 space-y-2 max-h-40 overflow-y-auto rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">PINNED ({messages.filter(m => m.isPinned).length})</span>
              </div>
              <button
                onClick={() => setShowPinned(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {messages.filter(m => m.isPinned).length > 0 ? (
              <div className="space-y-1">
                {messages.filter(m => m.isPinned).map(msg => (
                  <div
                    key={msg.id}
                    className="text-xs bg-background rounded px-2 py-1 cursor-pointer hover:bg-muted transition-colors border border-border/50"
                    onClick={() => {
                      const el = document.getElementById(`msg-${msg.id}`)
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" })
                        el.classList.add("ring-2", "ring-primary/50")
                        setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000)
                      }
                      setShowPinned(false)
                    }}
                  >
                    <span className="font-medium">{msg.sender?.name || "Unknown"}: </span>
                    <span className="text-muted-foreground line-clamp-1">{msg.content || "[attachment]"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No pinned messages yet</p>
            )}
          </div>
        )}

        {/* Loading older messages indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"></div>
              <span>Loading older messages...</span>
              <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
            </div>
          </div>
        )}

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
            const isFromWhatsapp = (msg as any).isFromWhatsapp === true
            const isMe = !isFromWhatsapp && msg.senderId === user?.id
            const prevMsg = arr[i - 1]
            const showSender = !isMe && (i === 0 || prevMsg?.senderId !== msg.senderId)
            const isOptimistic = typeof msg.id === "number" && msg.id > 1_000_000_000_000

            const attachments = (msg as any).attachments || []
            const imageAttachments = attachments.filter((a: any) => a.mimeType?.startsWith("image/"))
            const audioAttachments = attachments.filter((a: any) => a.mimeType?.startsWith("audio/"))
            const fileAttachments = attachments.filter((a: any) => !a.mimeType?.startsWith("image/") && !a.mimeType?.startsWith("audio/"))
            
            // Get read receipts for this message (P3.4, P3.5)
            const reads = (msg as any).reads || []
            const readCount = reads.length
            const hasReads = readCount > 0

            return (
              <div key={msg.id} id={`msg-${msg.id}`} data-message-id={msg.id} className={cn("flex gap-3 max-w-[85%] transition-all", isMe ? "ml-auto flex-row-reverse" : "")}>
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

                  <div
                    className={cn(
                      "px-4 py-2.5 rounded-2xl relative group shadow-sm text-sm transition-opacity min-w-[80px]",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm shadow-md"
                        : "bg-muted/70 text-foreground rounded-bl-sm border border-border/40",
                      isOptimistic && "opacity-60"
                    )}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, msg })
                    }}
                  >
                    {msg.replyTo && (
                      <div
                        className={cn(
                          "mb-2 px-3 py-1.5 rounded-lg border-l-2 cursor-pointer text-xs",
                          isMe
                            ? "bg-white/10 border-white/40 text-primary-foreground/80"
                            : "bg-background/60 border-primary/40 text-muted-foreground"
                        )}
                        onClick={() => {
                          const el = document.getElementById(`msg-${msg.replyTo.id}`)
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" })
                            el.classList.add("ring-2", "ring-primary/50")
                            setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000)
                          }
                        }}
                      >
                        <span className="font-medium block">{msg.replyTo.sender?.name || "Unknown"}</span>
                        <span className="line-clamp-1 opacity-80">{msg.replyTo.content || "[attachment]"}</span>
                      </div>
                    )}

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

                    {/* Audio/Voice attachments (P2.5) */}
                    {audioAttachments.map((att: any, idx: number) => (
                      <AudioPlayer
                        key={`audio-${idx}`}
                        src={att.url}
                        isMe={isMe}
                        className="my-1"
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

                    {msg.content && (
                      <div>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        {linkPreviews[msg.id] && (
                          <a
                            href={linkPreviews[msg.id].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex gap-3 mt-2 rounded-lg border overflow-hidden hover:opacity-80 transition-opacity max-w-sm",
                              isMe
                                ? "bg-white/10 border-white/20"
                                : "bg-muted border-border/60"
                            )}
                          >
                            {linkPreviews[msg.id].image && (
                              <img
                                src={linkPreviews[msg.id].image}
                                alt={linkPreviews[msg.id].title}
                                className="w-24 h-24 object-cover shrink-0"
                              />
                            )}
                            <div className="flex-1 p-2 min-w-0">
                              <p className="text-xs font-semibold line-clamp-1">{linkPreviews[msg.id].title}</p>
                              <p className="text-xs opacity-70 line-clamp-2">{linkPreviews[msg.id].description}</p>
                              <p className="text-xs opacity-60 mt-1">{linkPreviews[msg.id].domain}</p>
                            </div>
                          </a>
                        )}
                      </div>
                    )}

                    <div className={cn(
                      "flex items-center gap-1 mt-1",
                      isMe ? "justify-end" : "justify-start"
                    )}>
                      <span className={cn(
                        "text-[10px] opacity-70",
                        isMe ? "text-right" : "text-left"
                      )}>
                        {format(new Date(msg.createdAt), "HH:mm")}
                        {msg.isEdited && " (edited)"}
                      </span>
                      {/* Read receipts indicator (P3.4) */}
                      {isMe && hasReads && (
                        <span 
                          title={`Seen by ${readCount} people at ${reads.map((r: any) => format(new Date(r.readAt), "HH:mm")).join(", ")}`}
                          className="text-[10px] opacity-70 text-blue-500 font-semibold"
                        >
                          ✓✓
                        </span>
                      )}
                      {isMe && !hasReads && (
                        <span className="text-[10px] opacity-70">✓</span>
                      )}
                    </div>

                    <div className={cn(
                      "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border shadow-md rounded-lg flex items-center p-1 gap-0.5",
                      isMe ? "-left-20" : "-right-20"
                    )}>
                      <button
                        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                        title="Reply"
                        onClick={() => {
                          setReplyToMessage(msg)
                          textareaRef.current?.focus()
                        }}
                      >
                        <Reply className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                        title={msg.isPinned ? "Unpin" : "Pin"}
                        onClick={() => {
                          fetch(`/api/conversations/${conversationId}/messages/${msg.id}/pin`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${token}` }
                          }).then(() => {
                            queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId, {}) })
                          }).catch(err => console.error("Pin error:", err))
                        }}
                      >
                        <Pin className={cn("w-3 h-3", msg.isPinned && "fill-current text-primary")} />
                      </button>
                      <button
                        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                        title={msg.isFavorited ? "Unfavorite" : "Favorite"}
                        onClick={() => {
                          fetch(`/api/conversations/${conversationId}/messages/${msg.id}/favorite`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${token}` }
                          }).then(() => {
                            queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId, {}) })
                          }).catch(err => console.error("Favorite error:", err))
                        }}
                      >
                        <Heart className={cn("w-3 h-3", msg.isFavorited && "fill-red-500 text-red-500")} />
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

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
        >
          <div
            className="absolute bg-popover border border-border shadow-lg rounded-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
              onClick={() => {
                setReplyToMessage(contextMenu.msg)
                setContextMenu(null)
                textareaRef.current?.focus()
              }}
            >
              <Reply className="w-4 h-4" />
              Reply
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
              onClick={() => {
                fetch(`/api/conversations/${conversationId}/messages/${contextMenu.msg.id}/pin`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${token}` }
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId, {}) })
                  setContextMenu(null)
                }).catch(err => console.error("Pin error:", err))
              }}
            >
              <Pin className="w-4 h-4" />
              {contextMenu.msg.isPinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
              onClick={() => {
                fetch(`/api/conversations/${conversationId}/messages/${contextMenu.msg.id}/favorite`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${token}` }
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId, {}) })
                  setContextMenu(null)
                }).catch(err => console.error("Favorite error:", err))
              }}
            >
              <Heart className="w-4 h-4" />
              {contextMenu.msg.isFavorited ? "Unfavorite" : "Favorite"}
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        {/* Upload error alert */}
        {uploadError && (
          <div className="mb-3 flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-destructive font-medium">Upload Gagal</p>
              <p className="text-xs text-destructive/80 mt-1">{uploadError}</p>
            </div>
            <button
              onClick={() => setUploadError(null)}
              className="text-destructive/60 hover:text-destructive transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {replyToMessage && (
          <div className="mb-2 flex items-center gap-2 bg-muted/50 border border-border/50 rounded-lg px-3 py-2">
            <Reply className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
              <span className="text-xs font-medium text-primary block">{replyToMessage.sender?.name || "Unknown"}</span>
              <span className="text-xs text-muted-foreground line-clamp-1">{replyToMessage.content || "[attachment]"}</span>
            </div>
            <button
              onClick={() => setReplyToMessage(null)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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

          {showVoiceRecorder ? (
            <div className="flex items-center bg-card border border-border/60 rounded-2xl p-2 shadow-sm">
              <VoiceRecorder
                onRecorded={handleVoiceRecorded}
                onCancel={() => setShowVoiceRecorder(false)}
                disabled={uploading}
              />
            </div>
          ) : (
            <form
              onSubmit={handleSend}
              className="flex items-end gap-1 sm:gap-2 bg-card border border-border/60 rounded-2xl p-1.5 sm:p-2 shadow-sm focus-within:ring-2 ring-primary/20 transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.mp3,.wav,.ogg,.webm,.m4a"
                onChange={handleFileSelect}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "shrink-0 rounded-lg h-8 w-8 sm:h-10 sm:w-10 sm:rounded-xl transition-colors",
                  uploading ? "opacity-50" : "text-muted-foreground hover:text-primary"
                )}
                title="Attach file"
              >
                {uploading ? (
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowEmoji(v => !v)}
                className={cn(
                  "shrink-0 rounded-lg h-8 w-8 sm:h-10 sm:w-10 sm:rounded-xl hidden sm:inline-flex transition-colors",
                  showEmoji ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary"
                )}
                title="Emoji"
              >
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>

              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  const text = e.target.value
                  setInputText(text)
                  if (text.trim().length > 0) {
                    sendTyping()
                  }
                }}
                placeholder={pendingFile ? "Add a caption..." : "Type a message..."}
                rows={1}
                className="flex-1 max-h-32 min-h-[36px] sm:min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-2 sm:py-3 px-2 text-xs sm:text-sm custom-scrollbar"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e as any)
                  }
                }}
              />

              {canSend ? (
                <Button
                  type="submit"
                  size="icon"
                  className="shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-transform active:scale-95"
                >
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="shrink-0 rounded-lg h-8 w-8 sm:h-10 sm:w-10 sm:rounded-xl sm:hidden text-muted-foreground hover:text-primary transition-colors"
                    title="Emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowVoiceRecorder(true)}
                    className="shrink-0 rounded-lg h-8 w-8 sm:h-10 sm:w-10 sm:rounded-xl hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors"
                    title="Pesan suara"
                  >
                    <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>

    {showGroupInfo && isGroup && conversation && (
      <GroupInfoPanel
        conversation={conversation}
        onClose={() => setShowGroupInfo(false)}
        onNavigate={navigate}
      />
    )}
    </div>
  )
}
