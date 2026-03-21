import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/hooks/use-auth"
import {
  Shield, AlertTriangle, Eye, Search, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertOctagon, Filter, BarChart3, FileText,
  ScanSearch, Clock, TrendingUp, Ban, ShieldAlert, Activity
} from "lucide-react"

interface ComplianceFlag {
  id: number
  messageId: number | null
  conversationId: number | null
  userId: number | null
  flagType: string
  piiTypes: string[] | null
  originalContent: string | null
  redactedContent: string | null
  severity: string
  status: string
  reviewedById: number | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  userName: string | null
  userDepartment: string | null
  conversationName: string | null
  conversationType: string | null
  reviewerName: string | null
}

interface Stats {
  total: number
  byStatus: { pending: number; reviewed: number; dismissed: number; escalated: number }
  bySeverity: { critical: number; high: number; medium: number; low: number }
  byType: { blocked: number; pii_detected: number; risky_content: number }
  recentTrend: { date: string; count: number }[]
  topUsers: { userId: number; userName: string; count: number }[]
}

const PII_TYPE_LABELS: Record<string, string> = {
  nik: "NIK / KTP",
  email: "Email",
  phone_id: "Telepon",
  credit_card: "Kartu Kredit",
  npwp: "NPWP",
  bank_account: "Rekening",
  passport: "Paspor",
  bpjs: "BPJS",
  ktp: "KTP",
  ip_address: "IP Address",
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "Kritis", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
  high: { label: "Tinggi", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
  medium: { label: "Sedang", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
  low: { label: "Rendah", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: "Menunggu", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", icon: Clock },
  reviewed: { label: "Ditinjau", color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: CheckCircle2 },
  dismissed: { label: "Ditolak", color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800/30", icon: XCircle },
  escalated: { label: "Dieskalasi", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: AlertOctagon },
}

const FLAG_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pii_detected: { label: "PII Terdeteksi", color: "text-orange-600", icon: Eye },
  blocked: { label: "Diblokir", color: "text-red-600", icon: Ban },
  risky_content: { label: "Konten Berisiko", color: "text-yellow-600", icon: AlertTriangle },
}

export default function Compliance() {
  const { token, user } = useAuthStore()
  const isAdmin = user?.role === "admin"
  const [activeTab, setActiveTab] = useState<"overview" | "flags" | "scanner">("overview")
  const [stats, setStats] = useState<Stats | null>(null)
  const [flags, setFlags] = useState<ComplianceFlag[]>([])
  const [totalFlags, setTotalFlags] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [scanText, setScanText] = useState("")
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanning, setScanning] = useState(false)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [reviewNote, setReviewNote] = useState("")

  useEffect(() => { fetchStats() }, [])
  useEffect(() => { if (activeTab === "flags") fetchFlags() }, [activeTab, page, statusFilter, severityFilter])

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/compliance/stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setStats(await res.json())
    } catch (err) { console.error(err) }
  }

  const fetchFlags = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (severityFilter !== "all") params.set("severity", severityFilter)
      const res = await fetch(`/api/compliance/flags?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setFlags(data.flags)
        setTotalFlags(data.total)
        setTotalPages(data.totalPages)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleReview = async (flagId: number, status: string) => {
    try {
      const res = await fetch(`/api/compliance/flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, reviewNote: reviewNote || undefined }),
      })
      if (res.ok) {
        setReviewingId(null)
        setReviewNote("")
        fetchFlags()
        fetchStats()
      }
    } catch (err) { console.error(err) }
  }

  const handleScan = async () => {
    if (!scanText.trim()) return
    setScanning(true)
    try {
      const res = await fetch("/api/compliance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: scanText }),
      })
      if (res.ok) setScanResult(await res.json())
    } catch (err) { console.error(err) }
    finally { setScanning(false) }
  }

  const tabs = [
    { id: "overview" as const, label: "Ringkasan", icon: BarChart3 },
    { id: "flags" as const, label: "Pesan Ditandai", icon: FileText },
    { id: "scanner" as const, label: "Scanner", icon: ScanSearch },
  ]

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <h2 className="text-lg font-bold mb-1">Akses Ditolak</h2>
            <p className="text-sm text-muted-foreground">Halaman ini hanya untuk administrator.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card/50 backdrop-blur-md px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold">Compliance Assistant</h1>
                <p className="text-xs text-muted-foreground">Pemantauan data sensitif & kepatuhan</p>
              </div>
            </div>
          </div>

          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === "overview" && <OverviewTab stats={stats} />}
          {activeTab === "flags" && (
            <FlagsTab
              flags={flags}
              loading={loading}
              page={page}
              totalPages={totalPages}
              totalFlags={totalFlags}
              statusFilter={statusFilter}
              severityFilter={severityFilter}
              onPageChange={setPage}
              onStatusFilter={setStatusFilter}
              onSeverityFilter={setSeverityFilter}
              reviewingId={reviewingId}
              reviewNote={reviewNote}
              onReviewingIdChange={setReviewingId}
              onReviewNoteChange={setReviewNote}
              onReview={handleReview}
            />
          )}
          {activeTab === "scanner" && (
            <ScannerTab
              scanText={scanText}
              onScanTextChange={setScanText}
              scanResult={scanResult}
              scanning={scanning}
              onScan={handleScan}
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}

function StatCard({ title, value, icon: Icon, color, subtext }: {
  title: string; value: number | string; icon: any; color: string; subtext?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
        </div>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ stats }: { stats: Stats | null }) {
  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  const maxTrend = Math.max(...(stats.recentTrend.map(t => t.count) || [1]), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Flag" value={stats.total} icon={Shield} color="bg-purple-100 dark:bg-purple-900/30 text-purple-600" />
        <StatCard title="Menunggu Review" value={stats.byStatus.pending} icon={Clock} color="bg-amber-100 dark:bg-amber-900/30 text-amber-600" subtext="Perlu ditinjau" />
        <StatCard title="Diblokir" value={stats.byType.blocked} icon={Ban} color="bg-red-100 dark:bg-red-900/30 text-red-600" subtext="PII di channel publik" />
        <StatCard title="PII Terdeteksi" value={stats.byType.pii_detected} icon={Eye} color="bg-orange-100 dark:bg-orange-900/30 text-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Distribusi Severity
          </h3>
          <div className="space-y-3">
            {(["critical", "high", "medium", "low"] as const).map(sev => {
              const cfg = SEVERITY_CONFIG[sev]
              const val = stats.bySeverity[sev]
              const pct = stats.total > 0 ? (val / stats.total) * 100 : 0
              return (
                <div key={sev} className="flex items-center gap-3">
                  <span className={cn("text-xs font-semibold w-16", cfg.color)}>{cfg.label}</span>
                  <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden">
                    <div
                      className={cn("h-full rounded-lg transition-all duration-500", cfg.bg)}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-10 text-right">{val}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Tren 30 Hari Terakhir
          </h3>
          {stats.recentTrend.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Belum ada data
            </div>
          ) : (
            <div className="flex items-end gap-0.5 h-32">
              {stats.recentTrend.slice(-30).map((t, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-colors min-h-[2px]"
                    style={{ height: `${(t.count / maxTrend) * 100}%` }}
                  />
                  <div className="absolute -top-8 bg-popover border border-border shadow px-2 py-1 rounded text-[10px] hidden group-hover:block whitespace-nowrap z-10">
                    {t.date}: {t.count} flag
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-4">Status Review</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["pending", "reviewed", "dismissed", "escalated"] as const).map(status => {
              const cfg = STATUS_CONFIG[status]
              const val = stats.byStatus[status]
              return (
                <div key={status} className={cn("rounded-xl p-3 flex items-center gap-3", cfg.bg)}>
                  <cfg.icon className={cn("w-5 h-5", cfg.color)} />
                  <div>
                    <p className="text-lg font-bold">{val}</p>
                    <p className={cn("text-[10px] font-medium", cfg.color)}>{cfg.label}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-4">Top User dengan Flag</h3>
          {stats.topUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data</p>
          ) : (
            <div className="space-y-2">
              {stats.topUsers.slice(0, 5).map((u, i) => (
                <div key={u.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                  <span className="text-sm flex-1 truncate">{u.userName || "Unknown"}</span>
                  <span className="text-sm font-bold">{u.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FlagsTab({ flags, loading, page, totalPages, totalFlags, statusFilter, severityFilter,
  onPageChange, onStatusFilter, onSeverityFilter, reviewingId, reviewNote,
  onReviewingIdChange, onReviewNoteChange, onReview }: {
  flags: ComplianceFlag[]; loading: boolean; page: number; totalPages: number; totalFlags: number;
  statusFilter: string; severityFilter: string;
  onPageChange: (p: number) => void; onStatusFilter: (s: string) => void; onSeverityFilter: (s: string) => void;
  reviewingId: number | null; reviewNote: string;
  onReviewingIdChange: (id: number | null) => void; onReviewNoteChange: (n: string) => void;
  onReview: (id: number, status: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={e => { onStatusFilter(e.target.value); onPageChange(1) }}
          className="text-xs bg-background border border-border rounded-lg px-3 py-2"
        >
          <option value="all">Semua Status</option>
          <option value="pending">Menunggu</option>
          <option value="reviewed">Ditinjau</option>
          <option value="dismissed">Ditolak</option>
          <option value="escalated">Dieskalasi</option>
        </select>
        <select
          value={severityFilter}
          onChange={e => { onSeverityFilter(e.target.value); onPageChange(1) }}
          className="text-xs bg-background border border-border rounded-lg px-3 py-2"
        >
          <option value="all">Semua Severity</option>
          <option value="critical">Kritis</option>
          <option value="high">Tinggi</option>
          <option value="medium">Sedang</option>
          <option value="low">Rendah</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{totalFlags} total</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Shield className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium">Tidak ada flag ditemukan</p>
          <p className="text-xs mt-1">Sistem bersih dari pelanggaran compliance</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map(flag => {
            const sevCfg = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.medium
            const statusCfg = STATUS_CONFIG[flag.status] || STATUS_CONFIG.pending
            const typeCfg = FLAG_TYPE_CONFIG[flag.flagType] || FLAG_TYPE_CONFIG.pii_detected
            const isReviewing = reviewingId === flag.id

            return (
              <div key={flag.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", sevCfg.bg, sevCfg.color)}>
                        {sevCfg.label}
                      </span>
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", statusCfg.bg, statusCfg.color)}>
                        <statusCfg.icon className="w-3 h-3" />
                        {statusCfg.label}
                      </span>
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", typeCfg.color)}>
                        <typeCfg.icon className="w-3 h-3" />
                        {typeCfg.label}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mb-1">
                      <span className="font-semibold text-foreground">{flag.userName || "Unknown"}</span>
                      {flag.userDepartment && <span className="ml-1">({flag.userDepartment})</span>}
                      {" "}&mdash;{" "}
                      {flag.conversationName || (flag.conversationType === "direct" ? "Pesan Langsung" : "Chat")}
                      {" "}&bull;{" "}
                      {new Date(flag.createdAt).toLocaleString("id-ID")}
                    </p>

                    <div className="bg-muted/50 rounded-lg p-3 mt-2">
                      <p className="text-xs font-mono break-all text-muted-foreground">
                        {flag.redactedContent || flag.originalContent || "—"}
                      </p>
                    </div>

                    {flag.piiTypes && (flag.piiTypes as string[]).length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {(flag.piiTypes as string[]).map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                            {PII_TYPE_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    )}

                    {flag.reviewerName && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Ditinjau oleh {flag.reviewerName}
                        {flag.reviewedAt && ` pada ${new Date(flag.reviewedAt).toLocaleString("id-ID")}`}
                        {flag.reviewNote && ` — "${flag.reviewNote}"`}
                      </p>
                    )}
                  </div>

                  {flag.status === "pending" && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {isReviewing ? (
                        <div className="space-y-2 w-48">
                          <Input
                            value={reviewNote}
                            onChange={e => onReviewNoteChange(e.target.value)}
                            placeholder="Catatan (opsional)..."
                            className="h-7 text-xs"
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-[10px] flex-1" onClick={() => onReview(flag.id, "reviewed")}>
                              <CheckCircle2 className="w-3 h-3 mr-0.5" /> OK
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => onReview(flag.id, "dismissed")}>
                              Tolak
                            </Button>
                            <Button size="sm" variant="destructive" className="h-6 text-[10px] flex-1" onClick={() => onReview(flag.id, "escalated")}>
                              Eskalasi
                            </Button>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] w-full" onClick={() => onReviewingIdChange(null)}>
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onReviewingIdChange(flag.id)}>
                          <Eye className="w-3 h-3 mr-1" /> Review
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function ScannerTab({ scanText, onScanTextChange, scanResult, scanning, onScan }: {
  scanText: string; onScanTextChange: (t: string) => void; scanResult: any; scanning: boolean; onScan: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <ScanSearch className="w-5 h-5 text-primary" />
          PII Scanner
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Uji deteksi data sensitif (PII) pada teks. Masukkan teks di bawah untuk melihat apakah mengandung informasi pribadi.
        </p>

        <textarea
          value={scanText}
          onChange={e => onScanTextChange(e.target.value)}
          placeholder="Contoh: NIK saya 3201234567890123, email john@company.com, HP 081234567890..."
          className="w-full h-32 p-4 bg-background border border-border rounded-xl text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />

        <Button onClick={onScan} disabled={scanning || !scanText.trim()} className="mt-3 gap-2">
          <Search className="w-4 h-4" />
          {scanning ? "Memindai..." : "Pindai Teks"}
        </Button>
      </div>

      {scanResult && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            {scanResult.hasPII ? (
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            ) : scanResult.isRisky ? (
              <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            )}
            <div>
              <h4 className="font-bold">
                {scanResult.hasPII ? "PII Terdeteksi!" : scanResult.isRisky ? "Konten Berisiko" : "Teks Bersih"}
              </h4>
              <p className="text-xs text-muted-foreground">
                Severity: <span className={cn("font-semibold", SEVERITY_CONFIG[scanResult.severity]?.color)}>
                  {SEVERITY_CONFIG[scanResult.severity]?.label || scanResult.severity}
                </span>
              </p>
            </div>
          </div>

          {scanResult.matchDetails && scanResult.matchDetails.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Data Sensitif Ditemukan</h5>
              <div className="space-y-2">
                {scanResult.matchDetails.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg">
                    <Eye className="w-4 h-4 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-red-700 dark:text-red-400">{m.typeLabel}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded font-mono">{m.value}</code>
                        <span className="text-[10px] text-muted-foreground">&rarr;</span>
                        <code className="text-xs bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded font-mono">{m.redacted}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scanResult.riskyKeywords && scanResult.riskyKeywords.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Kata Kunci Berisiko</h5>
              <div className="flex gap-1.5 flex-wrap">
                {scanResult.riskyKeywords.map((kw: string) => (
                  <span key={kw} className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-full font-medium">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {scanResult.redactedContent && scanResult.hasPII && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Versi Redaksi</h5>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-mono break-all">{scanResult.redactedContent}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
