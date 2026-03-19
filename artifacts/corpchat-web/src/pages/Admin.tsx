import { AppLayout } from "@/components/layout/AppLayout"
import { useGetAuditStats, useGetAuditLogs } from "@workspace/api-client-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Activity, Users, MessageSquare, Database, Download,
  ChevronLeft, ChevronRight, Search, Filter, TrendingUp, TrendingDown, Shield,
  LogIn, RefreshCw
} from "lucide-react"
import { format } from "date-fns"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, Area, AreaChart
} from "recharts"
import { useState, useMemo } from "react"

const ACTION_COLORS: Record<string, string> = {
  login_success: "#22c55e",
  login_failed: "#ef4444",
  sso_login_success: "#3b82f6",
  send_message: "#8b5cf6",
  edit_message: "#f59e0b",
  delete_message: "#ef4444",
  pin_message: "#f97316",
  create_conversation: "#06b6d4",
  upload_file: "#10b981",
  deactivate_user: "#dc2626",
}

const PIE_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#10b981", "#6366f1",
  "#84cc16", "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9"
]

function formatActionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetAuditStats()

  const [logsPage, setLogsPage] = useState(1)
  const [actionFilter, setActionFilter] = useState("")
  const [searchFilter, setSearchFilter] = useState("")
  const [activeTab, setActiveTab] = useState<"overview" | "audit" | "analytics">("overview")

  const logsParams: any = { limit: 20, page: logsPage }
  if (actionFilter) logsParams.action = actionFilter
  const { data: logsData, isLoading: logsLoading } = useGetAuditLogs(logsParams)

  const logs = logsData?.logs || []
  const totalLogs = logsData?.total || 0
  const totalPages = Math.ceil(totalLogs / 20)

  const filteredLogs = useMemo(() => {
    if (!searchFilter) return logs
    const q = searchFilter.toLowerCase()
    return logs.filter((log: any) =>
      (log.user?.name || "").toLowerCase().includes(q) ||
      (log.action || "").toLowerCase().includes(q) ||
      (log.entityType || "").toLowerCase().includes(q) ||
      (log.ipAddress || "").toLowerCase().includes(q)
    )
  }, [logs, searchFilter])

  const uniqueActions = useMemo(() => {
    const actions = (stats?.actionDistribution || []).map((a: any) => a.action)
    return actions
  }, [stats])

  const handleExport = () => {
    const csvHeader = "Timestamp,User,Action,Entity Type,Entity ID,IP Address\n"
    const csvRows = filteredLogs.map((log: any) =>
      `"${format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}","${log.user?.name || "System"}","${log.action}","${log.entityType || ""}","${log.entityId || ""}","${log.ipAddress || ""}"`
    ).join("\n")
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `curcol-audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
        <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-muted-foreground mt-1">System overview, analytics & audit trail</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchStats()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
            {(["overview", "analytics", "audit"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "overview" ? "Overview" : tab === "analytics" ? "Analytics" : "Audit Log"}
              </button>
            ))}
          </div>

          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Users"
                  value={stats?.totalUsers || 0}
                  icon={<Users className="w-5 h-5 text-blue-500" />}
                  color="blue"
                />
                <StatCard
                  title="Active Today"
                  value={stats?.activeUsersToday || 0}
                  icon={<Activity className="w-5 h-5 text-emerald-500" />}
                  subtitle={stats?.totalUsers ? `${Math.round((stats.activeUsersToday / stats.totalUsers) * 100)}% of total` : undefined}
                  color="emerald"
                />
                <StatCard
                  title="Total Messages"
                  value={stats?.totalMessages || 0}
                  icon={<MessageSquare className="w-5 h-5 text-purple-500" />}
                  trend={stats?.weeklyTrend}
                  subtitle={`${stats?.messagesToday || 0} today`}
                  color="purple"
                />
                <StatCard
                  title="Conversations"
                  value={stats?.totalConversations || 0}
                  icon={<Database className="w-5 h-5 text-orange-500" />}
                  color="orange"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Message Activity Chart */}
                <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Message Activity (Last 30 Days)</h3>
                  <div className="h-[280px] w-full">
                    {(stats?.messagesPerDay || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats?.messagesPerDay || []}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'MMM d')} stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)' }}
                            labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                          />
                          <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#colorCount)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">No message data available</div>
                    )}
                  </div>
                </div>

                {/* Top Users */}
                <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Top Active Users</h3>
                  <div className="space-y-3">
                    {(stats?.topActiveUsers || []).length > 0 ? (
                      stats.topActiveUsers.slice(0, 8).map((u: any, i: number) => (
                        <div key={u.userId} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}>
                              {i + 1}
                            </div>
                            <span className="font-medium text-sm truncate">{u.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">{u.messageCount}</Badge>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">No user data</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Activity Preview */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border/50 flex items-center justify-between">
                  <h3 className="text-lg font-bold">Recent System Activity</h3>
                  <Button variant="link" size="sm" onClick={() => setActiveTab("audit")}>
                    View All Logs →
                  </Button>
                </div>
                <AuditTable logs={(logsData?.logs || []).slice(0, 5)} compact />
              </div>
            </div>
          )}

          {/* ===== ANALYTICS TAB ===== */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Action Distribution Pie Chart */}
                <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Action Distribution (30 Days)</h3>
                  <div className="h-[320px] w-full">
                    {(stats?.actionDistribution || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.actionDistribution}
                            dataKey="count"
                            nameKey="action"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            label={({ action, count }) => `${formatActionLabel(action)} (${count})`}
                            labelLine={false}
                          >
                            {stats.actionDistribution.map((_: any, index: number) => (
                              <Cell key={index} fill={ACTION_COLORS[_.action] || PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any, name: any) => [value, formatActionLabel(name)]} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">No action data</div>
                    )}
                  </div>
                </div>

                {/* Login Activity Line Chart */}
                <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <LogIn className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold">Login Activity (30 Days)</h3>
                  </div>
                  <div className="h-[320px] w-full">
                    {(stats?.loginActivity || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.loginActivity}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'MMM d')} stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                            labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                          />
                          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">No login data</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Breakdown Bar Chart */}
              <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold">Action Breakdown (Last 30 Days)</h3>
                </div>
                <div className="h-[300px] w-full">
                  {(stats?.actionDistribution || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.actionDistribution} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis type="number" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="action" tickFormatter={formatActionLabel} stroke="#888888" fontSize={11} tickLine={false} axisLine={false} width={140} />
                        <Tooltip formatter={(value: any) => [value, "Count"]} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {stats.actionDistribution.map((entry: any, index: number) => (
                            <Cell key={index} fill={ACTION_COLORS[entry.action] || PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">No action data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== AUDIT LOG TAB ===== */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <select
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setLogsPage(1); }}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">All Actions</option>
                    {uniqueActions.map((action: string) => (
                      <option key={action} value={action}>{formatActionLabel(action)}</option>
                    ))}
                  </select>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>

              {/* Audit Table */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <AuditTable logs={filteredLogs} loading={logsLoading} />

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-border/50 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Page {logsPage} of {totalPages} ({totalLogs} total logs)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                        disabled={logsPage <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const start = Math.max(1, Math.min(logsPage - 2, totalPages - 4))
                        const page = start + i
                        if (page > totalPages) return null
                        return (
                          <Button
                            key={page}
                            variant={page === logsPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setLogsPage(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        )
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogsPage(p => Math.min(totalPages, p + 1))}
                        disabled={logsPage >= totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

function AuditTable({ logs, compact, loading }: { logs: any[], compact?: boolean, loading?: boolean }) {
  const getActionColor = (action: string) => {
    if (action.includes("failed") || action.includes("delete")) return "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
    if (action.includes("success") || action.includes("create")) return "text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
    if (action.includes("edit") || action.includes("update") || action.includes("pin")) return "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
    return "text-muted-foreground bg-muted/50 border-border"
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/40 text-muted-foreground uppercase text-xs font-semibold tracking-wider">
          <tr>
            <th className="px-5 py-3">Timestamp</th>
            <th className="px-5 py-3">User</th>
            <th className="px-5 py-3">Action</th>
            <th className="px-5 py-3">Entity</th>
            <th className="px-5 py-3">IP Address</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                Loading...
              </td>
            </tr>
          ) : logs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                No logs found
              </td>
            </tr>
          ) : (
            logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap text-muted-foreground text-xs font-mono">
                  {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                </td>
                <td className="px-5 py-3 font-medium text-sm">
                  {log.user?.name || `System (${log.userId || 'N/A'})`}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground text-sm">
                  {log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}` : '—'}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {log.ipAddress || 'N/A'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ title, value, icon, trend, subtitle, color }: {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: number
  subtitle?: string
  color?: string
}) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-muted-foreground font-medium text-sm">{title}</h4>
        <div className="p-2 bg-muted/60 rounded-xl">{icon}</div>
      </div>
      <div className="text-2xl font-display font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="flex items-center gap-2 mt-1">
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
            trend >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "text-red-500 bg-red-50 dark:bg-red-950/30"
          }`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend >= 0 ? "+" : ""}{trend}% vs last week
          </span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  )
}
