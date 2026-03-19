import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/hooks/use-auth"
import {
  CheckCircle, XCircle, MessageCircle, Send, Copy,
  ExternalLink, Phone, Settings, RefreshCw,
  ClipboardCheck, UserCheck, UserX, CheckCheck, Inbox, User
} from "lucide-react"

interface WAStatus {
  configured: boolean
  phoneNumberId: string | null
  stats: {
    usersWithWhatsapp: number
    whatsappConversations: number
    whatsappMessages: number
  }
  webhookPath: string
}

interface WAConversation {
  id: number
  name: string
  whatsappContactPhone: string | null
  whatsappContactName: string | null
  waStatus: "unassigned" | "assigned" | "resolved" | null
  assignedToId: number | null
  assignedTo: {
    id: number
    fullName: string
    employeeId: string
    avatarUrl?: string | null
  } | null
  updatedAt: string
}

const STATUS_LABELS = {
  unassigned: { label: "Belum Diambil", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  assigned: { label: "Sedang Ditangani", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  resolved: { label: "Selesai", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
}

type TabType = "unassigned" | "assigned" | "resolved"

export default function AdminWhatsApp() {
  const { toast } = useToast()
  const currentUser = useAuthStore(s => s.user)

  const [status, setStatus] = useState<WAStatus | null>(null)
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>("unassigned")
  const [testPhone, setTestPhone] = useState("")
  const [testMessage, setTestMessage] = useState("✅ Halo! Ini adalah pesan test dari CurCol.")
  const [sending, setSending] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStatus(), loadConversations()])
    setLoading(false)
  }

  async function loadStatus() {
    try {
      const res = await fetch("/api/admin/whatsapp/status")
      if (res.ok) setStatus(await res.json())
    } catch {}
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/admin/whatsapp/conversations")
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch {}
  }

  async function handleClaim(convId: number) {
    setActionLoading(convId)
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${convId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        toast({ title: "✅ Berhasil diambil", description: "Konversasi ini sekarang ditangani oleh Anda." })
        await loadConversations()
        setActiveTab("assigned")
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat mengambil konversasi." })
      }
    } catch {
      toast({ variant: "destructive", title: "Error jaringan" })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUnassign(convId: number) {
    setActionLoading(convId)
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${convId}/unassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        toast({ title: "Dikembalikan ke antrian" })
        await loadConversations()
      }
    } catch {}
    finally { setActionLoading(null) }
  }

  async function handleResolve(convId: number) {
    setActionLoading(convId)
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${convId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        toast({ title: "✅ Ditandai selesai" })
        await loadConversations()
        setActiveTab("resolved")
      }
    } catch {}
    finally { setActionLoading(null) }
  }

  async function handleTestSend() {
    if (!testPhone.trim() || !testMessage.trim()) return
    setSending(true)
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: testPhone, message: testMessage }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: "✅ Pesan berhasil dikirim!", description: `Terkirim ke ${data.phone}` })
      } else {
        toast({ variant: "destructive", title: "Gagal mengirim", description: data.error })
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message })
    } finally {
      setSending(false)
    }
  }

  function copyText(text: string, key: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(key)
    toast({ title: `${label} disalin!` })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = conversations.filter(c => {
    const s = c.waStatus || "unassigned"
    return s === activeTab
  })

  const counts = {
    unassigned: conversations.filter(c => (c.waStatus || "unassigned") === "unassigned").length,
    assigned: conversations.filter(c => c.waStatus === "assigned").length,
    resolved: conversations.filter(c => c.waStatus === "resolved").length,
  }

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "unassigned", label: "Belum Diambil", icon: <Inbox className="w-4 h-4" /> },
    { key: "assigned", label: "Sedang Ditangani", icon: <UserCheck className="w-4 h-4" /> },
    { key: "resolved", label: "Selesai", icon: <CheckCheck className="w-4 h-4" /> },
  ]

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-green-500" />
                WhatsApp Inbox
              </h1>
              <p className="text-muted-foreground mt-1">Kelola pesan WhatsApp masuk dari kontak eksternal</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadAll} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowConfig(v => !v)} className="gap-2">
                <Settings className="w-4 h-4" />
                Konfigurasi
              </Button>
            </div>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/20">
            {status?.configured ? (
              <Badge className="bg-green-100 text-green-700 gap-1 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="w-3 h-3" /> Twilio Terhubung
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="w-3 h-3" /> Tidak Terkonfigurasi
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              Nomor: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{status?.phoneNumberId || "—"}</code>
            </span>
            <span className="text-sm text-muted-foreground ml-auto">
              Total: {conversations.length} konversasi
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted/30 rounded-xl border border-border/40">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                    tab.key === "unassigned" ? "bg-amber-500 text-white" :
                    tab.key === "assigned" ? "bg-blue-500 text-white" :
                    "bg-green-500 text-white"
                  }`}>
                    {counts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Conversation list */}
          <Card className="p-0 border-border/50 overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse h-16 bg-muted rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground">
                {activeTab === "unassigned" && <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />}
                {activeTab === "assigned" && <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />}
                {activeTab === "resolved" && <CheckCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />}
                <p className="text-sm font-medium">
                  {activeTab === "unassigned" && "Tidak ada pesan yang belum diambil"}
                  {activeTab === "assigned" && "Tidak ada percakapan yang sedang ditangani"}
                  {activeTab === "resolved" && "Belum ada percakapan yang diselesaikan"}
                </p>
                <p className="text-xs mt-1 opacity-70">
                  {activeTab === "unassigned" && "Pesan WhatsApp baru dari luar akan muncul di sini"}
                  {activeTab === "assigned" && "Klik \"Ambil\" di tab Belum Diambil untuk mulai menangani"}
                  {activeTab === "resolved" && "Percakapan yang sudah selesai akan tercatat di sini"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filtered.map(conv => {
                  const isLoading = actionLoading === conv.id
                  const isMyConv = conv.assignedToId === currentUser?.id
                  return (
                    <div key={conv.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <Phone className="w-5 h-5 text-green-600" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">
                            {conv.whatsappContactName || conv.name}
                          </p>
                          <Badge className={`text-xs px-2 py-0 h-5 ${STATUS_LABELS[conv.waStatus || "unassigned"].color}`}>
                            {STATUS_LABELS[conv.waStatus || "unassigned"].label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {conv.whatsappContactPhone}
                        </p>
                        {conv.assignedTo && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Ditangani: <strong>{conv.assignedTo.fullName}</strong>
                            {isMyConv && " (Anda)"}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={`/chat/${conv.id}`}
                          className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded border border-border/50 hover:bg-muted/50 transition-colors"
                        >
                          Buka <ExternalLink className="w-3 h-3" />
                        </a>

                        {activeTab === "unassigned" && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
                            onClick={() => handleClaim(conv.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <UserCheck className="w-3 h-3" />
                            )}
                            Ambil
                          </Button>
                        )}

                        {activeTab === "assigned" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 h-8 text-xs"
                              onClick={() => handleUnassign(conv.id)}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <UserX className="w-3 h-3" />
                              )}
                              Kembalikan
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                              onClick={() => handleResolve(conv.id)}
                              disabled={isLoading}
                            >
                              <CheckCheck className="w-3 h-3" />
                              Selesai
                            </Button>
                          </>
                        )}

                        {activeTab === "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-xs"
                            onClick={() => handleClaim(conv.id)}
                            disabled={isLoading}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Buka Kembali
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Collapsible Config Section */}
          {showConfig && (
            <>
              {/* Test Send */}
              <Card className="p-6 border-border/50">
                <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Send className="w-5 h-5 text-green-500" />
                  Test Kirim Pesan
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block mb-2">
                      Nomor WhatsApp Tujuan (format internasional)
                    </label>
                    <Input
                      placeholder="628123456789"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block mb-2">Pesan Test</label>
                    <textarea
                      className="w-full text-sm border border-border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={3}
                      value={testMessage}
                      onChange={e => setTestMessage(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleTestSend}
                    disabled={sending || !status?.configured}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {sending ? "Mengirim..." : "Kirim Test"}
                  </Button>
                </div>
              </Card>

              {/* Webhook Info */}
              <Card className="p-6 border-border/50">
                <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Info Webhook Twilio
                </h2>
                <div>
                  <label className="text-sm font-semibold block mb-2">Webhook URL (Twilio Sandbox Settings)</label>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-3 rounded-lg break-all">
                      {window.location.origin.replace(/:\d+/, "")}/api/webhooks/twilio
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyText(
                        `${window.location.origin.replace(/:\d+/, "")}/api/webhooks/twilio`,
                        "webhook", "Webhook URL"
                      )}
                    >
                      {copiedId === "webhook" ? <ClipboardCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          )}

        </div>
      </div>
    </AppLayout>
  )
}
