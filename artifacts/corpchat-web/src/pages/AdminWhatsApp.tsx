import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle, XCircle, MessageCircle, Send, Copy,
  ExternalLink, Users, Hash, Info, Phone, Settings, RefreshCw
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
  whatsappContactPhone: string
  whatsappContactName: string
  updatedAt: string
}

export default function AdminWhatsApp() {
  const { toast } = useToast()
  const [status, setStatus] = useState<WAStatus | null>(null)
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState("")
  const [testMessage, setTestMessage] = useState("✅ Halo! Ini adalah pesan test dari CurCol. WhatsApp integration berhasil terhubung.")
  const [sending, setSending] = useState(false)

  const webhookUrl = `${window.location.origin.replace(/:\d+/, "")}/api/webhooks/whatsapp`

  useEffect(() => {
    loadStatus()
    loadConversations()
  }, [])

  async function loadStatus() {
    try {
      const res = await fetch("/api/admin/whatsapp/status")
      if (res.ok) setStatus(await res.json())
    } catch {}
    setLoading(false)
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

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast({ title: `${label} disalin ke clipboard` })
  }

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
            <Button variant="outline" size="sm" onClick={() => { loadStatus(); loadConversations() }} className="gap-2">
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
                {[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm font-medium">API Connection</span>
                  {status?.configured ? (
                    <Badge className="bg-green-100 text-green-700 gap-1">
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
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {status?.phoneNumberId || "Belum dikonfigurasi"}
                    </code>
                    {status?.phoneNumberId && (
                      <button onClick={() => copyToClipboard(status.phoneNumberId!, "Phone Number ID")} className="text-muted-foreground hover:text-foreground">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats */}
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

          {/* Webhook Setup Guide */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Panduan Setup Webhook Meta
            </h2>
            <div className="space-y-4">

              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                Konfigurasi webhook di Meta Developer Console agar WhatsApp dapat menerima pesan masuk.
              </div>

              <div className="space-y-3">
                {[
                  { step: 1, text: "Buka", link: "https://developers.facebook.com/apps", linkText: "Meta Developer Console" },
                  { step: 2, text: "Pilih App → WhatsApp → Configuration" },
                  { step: 3, text: "Klik Edit di bagian Webhook" },
                  { step: 4, text: "Masukkan Callback URL berikut:" },
                  { step: 5, text: "Masukkan Verify Token dari secret WHATSAPP_WEBHOOK_VERIFY_TOKEN" },
                  { step: 6, text: "Subscribe field: messages, message_deliveries, message_reads" },
                  { step: 7, text: "Klik Verify and Save" },
                ].map(item => (
                  <div key={item.step} className="flex gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                      {item.step}
                    </span>
                    <span className="text-muted-foreground pt-0.5">
                      {item.text}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1 inline-flex items-center gap-1">
                          {item.linkText} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Webhook URL */}
              <div className="mt-4">
                <label className="text-sm font-medium text-muted-foreground block mb-2">Callback URL (Webhook):</label>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all border border-border">
                    {webhookUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")} className="flex-shrink-0 gap-1">
                    <Copy className="w-4 h-4" />
                    Salin
                  </Button>
                </div>
              </div>
            </div>
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
                <p className="text-sm text-destructive">API token belum dikonfigurasi. Set WHATSAPP_API_TOKEN di environment secrets.</p>
              )}
            </div>
          </Card>

          {/* External WhatsApp Conversations */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Konversasi WhatsApp Eksternal
              <Badge variant="secondary">{conversations.length}</Badge>
            </h2>
            {conversations.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Phone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Belum ada pesan masuk dari WhatsApp.</p>
                <p className="text-xs mt-1">Pesan dari kontak eksternal via WhatsApp akan muncul di sini.</p>
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
                    <a
                      href={`/chat/${conv.id}`}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Buka Chat <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* How it works */}
          <Card className="p-6 border-border/50">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Cara Kerja Integrasi
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {[
                {
                  icon: "📨",
                  title: "Pesan Masuk (External → CurCol)",
                  desc: "Kontak eksternal WhatsApp kirim pesan → masuk sebagai konversasi WhatsApp di CurCol → admin/manager bisa balas langsung dari CurCol",
                },
                {
                  icon: "📤",
                  title: "Balasan (CurCol → External)",
                  desc: "Tim CurCol membalas konversasi WhatsApp → pesan dikirim otomatis ke nomor WhatsApp kontak eksternal",
                },
                {
                  icon: "📢",
                  title: "Broadcast Pengumuman",
                  desc: "Admin buat pengumuman + pilih kirim via WhatsApp → semua karyawan yang punya nomor WA di profil mereka menerima notifikasi",
                },
                {
                  icon: "💬",
                  title: "Notifikasi DM",
                  desc: "User kirim pesan langsung (DM) → jika penerima punya nomor WA di profil, mereka dapat notifikasi WhatsApp secara otomatis",
                },
              ].map(item => (
                <div key={item.title} className="p-4 rounded-lg border border-border/50 bg-muted/20">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="font-medium text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </AppLayout>
  )
}
