import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle, XCircle, MessageCircle, Send, Copy,
  ExternalLink, Phone, Settings, RefreshCw, Eye, EyeOff, ClipboardCheck
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

interface WAConfig {
  verifyToken: string | null
  phoneNumberId: string | null
  configured: boolean
}

interface WAConversation {
  id: number
  name: string
  whatsappContactPhone: string
  whatsappContactName: string
  updatedAt: string
}

export default function AdminWhatsApp() {
  const { toast } = useToast()
  const [status, setStatus] = useState<WAStatus | null>(null)
  const [config, setConfig] = useState<WAConfig | null>(null)
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState("")
  const [testMessage, setTestMessage] = useState("✅ Halo! Ini adalah pesan test dari CurCol. WhatsApp integration berhasil terhubung.")
  const [sending, setSending] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const webhookUrl = `${window.location.origin.replace(/:\d+/, "")}/api/webhooks/whatsapp`

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStatus(), loadConfig(), loadConversations()])
    setLoading(false)
  }

  async function loadStatus() {
    try {
      const res = await fetch("/api/admin/whatsapp/status")
      if (res.ok) setStatus(await res.json())
    } catch {}
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/admin/whatsapp/config")
      if (res.ok) setConfig(await res.json())
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

  async function handleTestSend() {
    if (!testPhone.trim() || !testMessage.trim()) {
      toast({ variant: "destructive", title: "Isi nomor dan pesan test terlebih dahulu" })
      return
    }
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
    setCopied(key)
    toast({ title: `${label} disalin!` })
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyButton = ({ text, id, label }: { text: string; id: string; label: string }) => (
    <Button
      variant="outline"
      size="sm"
      className="flex-shrink-0 gap-1.5"
      onClick={() => copyText(text, id, label)}
    >
      {copied === id ? <ClipboardCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      {copied === id ? "Disalin!" : "Salin"}
    </Button>
  )

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-green-500" />
                WhatsApp Integration
              </h1>
              <p className="text-muted-foreground mt-1">Konfigurasi dan monitoring WhatsApp Business API</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadAll} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          {/* Status Card */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Status Konfigurasi
            </h2>
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm font-medium">API Connection</span>
                  {status?.configured ? (
                    <Badge className="bg-green-100 text-green-700 gap-1 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="w-3 h-3" /> Terhubung
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="w-3 h-3" /> Tidak Dikonfigurasi
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm font-medium">Phone Number ID</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {status?.phoneNumberId || "Belum dikonfigurasi"}
                  </code>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="text-2xl font-bold text-green-700">{status?.stats.usersWithWhatsapp || 0}</div>
                    <div className="text-xs text-green-600 mt-1">Users dengan WA</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="text-2xl font-bold text-blue-700">{status?.stats.whatsappConversations || 0}</div>
                    <div className="text-xs text-blue-600 mt-1">Konversasi WA</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <div className="text-2xl font-bold text-purple-700">{status?.stats.whatsappMessages || 0}</div>
                    <div className="text-xs text-purple-600 mt-1">Pesan dari WA</div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* === META WEBHOOK SETUP — nilai siap salin === */}
          <Card className="p-6 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
            <h2 className="font-semibold text-lg mb-1 flex items-center gap-2">
              <span className="text-xl">📋</span>
              Nilai untuk Diisi di Meta Developer Console
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Salin dua nilai di bawah ini ke form Webhook di Meta → Use cases → Customize → Configuration
            </p>

            <div className="space-y-4">
              {/* Callback URL */}
              <div>
                <label className="text-sm font-semibold block mb-2">
                  1. Callback URL
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(tempel ke field "Callback URL" di Meta)</span>
                </label>
                <div className="flex gap-2 items-stretch">
                  <code className="flex-1 text-xs bg-white dark:bg-background border border-border px-3 py-3 rounded-lg break-all leading-relaxed">
                    {webhookUrl}
                  </code>
                  <CopyButton text={webhookUrl} id="callback" label="Callback URL" />
                </div>
              </div>

              {/* Verify Token */}
              <div>
                <label className="text-sm font-semibold block mb-2">
                  2. Verify Token
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(tempel ke field "Verify token" di Meta)</span>
                </label>
                {config?.verifyToken ? (
                  <div className="flex gap-2 items-stretch">
                    <div className="flex-1 flex items-center bg-white dark:bg-background border border-border px-3 py-3 rounded-lg">
                      <code className="text-xs break-all flex-1">
                        {showToken ? config.verifyToken : "•".repeat(config.verifyToken.length)}
                      </code>
                      <button
                        onClick={() => setShowToken(v => !v)}
                        className="ml-2 text-muted-foreground hover:text-foreground flex-shrink-0"
                        title={showToken ? "Sembunyikan" : "Tampilkan"}
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <CopyButton text={config.verifyToken} id="token" label="Verify Token" />
                  </div>
                ) : (
                  <p className="text-sm text-destructive">Verify token belum dikonfigurasi di environment secrets.</p>
                )}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
                <span className="flex-shrink-0">⚠️</span>
                <span>
                  App Meta Anda masih mode <strong>development</strong> — webhook hanya menerima pesan dari akun admin/developer/tester yang terdaftar. Untuk pesan dari kontak umum, app perlu di-<strong>publish</strong> lebih dulu di Meta.
                </span>
              </div>
            </div>
          </Card>

          {/* Step guide ringkas */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <span className="text-xl">🔧</span>
              Cara Setup di Meta Developer Console
            </h2>
            <ol className="space-y-2">
              {[
                <>Buka <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Meta Developer Console <ExternalLink className="w-3 h-3" /></a></>,
                <>Klik <strong>CurCol-Enterprise</strong></>,
                <>Sidebar kiri → <strong>Use cases</strong> → klik <strong>Customize</strong></>,
                <>Pilih <strong>Configuration</strong> di submenu kiri</>,
                <>Scroll ke bagian <strong>Webhook</strong></>,
                <>Isi <strong>Callback URL</strong> dan <strong>Verify token</strong> dari nilai di atas</>,
                <>Klik <strong>Verify and Save</strong></>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Test Send */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-green-500" />
              Test Kirim Pesan
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  Nomor WhatsApp Tujuan (format internasional, tanpa +)
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
              {!status?.configured && (
                <p className="text-sm text-destructive">API token belum dikonfigurasi.</p>
              )}
            </div>
          </Card>

          {/* External Conversations */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Konversasi WhatsApp Masuk
              <Badge variant="secondary">{conversations.length}</Badge>
            </h2>
            {conversations.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Phone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Belum ada pesan masuk dari WhatsApp.</p>
                <p className="text-xs mt-1">Setelah webhook dikonfigurasi, pesan dari kontak eksternal akan muncul di sini.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map(conv => (
                  <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{conv.whatsappContactName || conv.name}</p>
                        <p className="text-xs text-muted-foreground">+{conv.whatsappContactPhone}</p>
                      </div>
                    </div>
                    <a href={`/chat/${conv.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                      Buka Chat <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>
      </div>
    </AppLayout>
  )
}
