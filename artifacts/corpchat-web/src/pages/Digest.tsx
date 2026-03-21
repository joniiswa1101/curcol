import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useAuthStore } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Sparkles, Loader2, Calendar, BookOpen, RefreshCw } from "lucide-react"

export default function DigestPage() {
  const { token } = useAuthStore()
  const [period, setPeriod] = useState<"daily" | "weekly">("daily")
  const [loading, setLoading] = useState(false)
  const [digest, setDigest] = useState("")
  const [conversations, setConversations] = useState<any[]>([])
  const [since, setSince] = useState("")

  const fetchDigest = async (p: "daily" | "weekly") => {
    setPeriod(p)
    setLoading(true)
    setDigest("")
    try {
      const res = await fetch("/api/summarize/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ period: p }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        setDigest("Gagal membuat digest: " + (errData?.error || `HTTP ${res.status}`))
        return
      }
      const data = await res.json()
      if (data.error) {
        setDigest("Gagal membuat digest: " + data.error)
      } else {
        setDigest(data.digest)
        setConversations(data.conversations || [])
        setSince(data.since || "")
      }
    } catch {
      setDigest("Gagal terhubung ke server.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="flex-1 h-full overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-violet-500" />
                <h2 className="text-2xl font-bold text-foreground">AI Digest</h2>
              </div>
              <p className="text-muted-foreground mt-1">Ringkasan otomatis aktivitas chat kamu</p>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <Button
              variant={period === "daily" ? "default" : "outline"}
              onClick={() => fetchDigest("daily")}
              disabled={loading}
              className="gap-2"
            >
              <Calendar className="w-4 h-4" />
              Digest Harian
            </Button>
            <Button
              variant={period === "weekly" ? "default" : "outline"}
              onClick={() => fetchDigest("weekly")}
              disabled={loading}
              className="gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Digest Mingguan
            </Button>
            {digest && (
              <Button
                variant="ghost"
                onClick={() => fetchDigest(period)}
                disabled={loading}
                size="icon"
                title="Refresh"
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            )}
          </div>

          {!digest && !loading && (
            <div className="text-center py-16 bg-card rounded-xl border border-border">
              <Sparkles className="w-16 h-16 mx-auto text-violet-500/20 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Buat Digest</h3>
              <p className="text-muted-foreground mb-4">
                Pilih "Digest Harian" atau "Digest Mingguan" untuk melihat ringkasan aktivitas chat kamu
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 bg-card rounded-xl border border-border">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-4" />
              <p className="text-muted-foreground">Sedang membuat ringkasan {period === "daily" ? "harian" : "mingguan"}...</p>
            </div>
          )}

          {digest && !loading && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-violet-500/5 to-blue-500/5 rounded-xl border border-border p-6">
                {since && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Periode: sejak {new Date(since).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {digest.split("\n").map((line, i) => {
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <p key={i} className="font-semibold text-foreground text-base mt-3 first:mt-0">{line.replace(/\*\*/g, "")}</p>
                    }
                    if (line.startsWith("- ")) {
                      return <p key={i} className="ml-3 text-muted-foreground">• {line.substring(2)}</p>
                    }
                    return <p key={i} className="text-muted-foreground">{line}</p>
                  })}
                </div>
              </div>

              {conversations.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-semibold text-foreground mb-3 text-sm">Percakapan Aktif</h3>
                  <div className="space-y-2">
                    {conversations.map((c: any) => (
                      <div key={c.conversationId} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground font-medium">{c.name}</span>
                          <p className="text-xs text-muted-foreground truncate">{c.preview}</p>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{c.messageCount} pesan</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
