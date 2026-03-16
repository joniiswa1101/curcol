import { AppLayout } from "@/components/layout/AppLayout"
import { useGetAuditStats, useGetAuditLogs } from "@workspace/api-client-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Users, MessageSquare, Database, Download } from "lucide-react"
import { format } from "date-fns"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Button } from "@/components/ui/button"

export default function AdminDashboard() {
  const { data: stats } = useGetAuditStats()
  const { data: logsData } = useGetAuditLogs({ limit: 10 })

  const logs = logsData?.logs || []

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-muted-foreground mt-1">System overview and audit logs</p>
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export Full Report
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Total Users" 
              value={stats?.totalUsers || 0} 
              icon={<Users className="w-6 h-6 text-blue-500" />} 
              trend="+12% this month"
            />
            <StatCard 
              title="Active Today" 
              value={stats?.activeUsersToday || 0} 
              icon={<Activity className="w-6 h-6 text-emerald-500" />} 
              trend="95% of total"
            />
            <StatCard 
              title="Total Messages" 
              value={stats?.totalMessages || 0} 
              icon={<MessageSquare className="w-6 h-6 text-purple-500" />} 
              trend="+2.4k today"
            />
            <StatCard 
              title="Conversations" 
              value={stats?.totalConversations || 0} 
              icon={<Database className="w-6 h-6 text-orange-500" />} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Chart */}
            <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6">Message Activity (Last 7 Days)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.messagesPerDay || []}>
                    <XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'MMM d')} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Users */}
            <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm flex flex-col">
              <h3 className="text-lg font-bold mb-6">Top Active Users</h3>
              <div className="space-y-4 flex-1">
                {stats?.topActiveUsers?.map((u, i) => (
                  <div key={u.userId} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        {i + 1}
                      </div>
                      <span className="font-semibold text-sm">{u.name}</span>
                    </div>
                    <Badge variant="secondary">{u.messageCount} msgs</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-lg font-bold">Recent System Activity</h3>
              <Button variant="link" size="sm">View All Logs</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase font-medium">
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Entity</th>
                    <th className="px-6 py-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {log.user?.name || `System (${log.userId})`}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {log.entityType} {log.entityId ? `#${log.entityId}` : ''}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {log.ipAddress || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No recent logs found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function StatCard({ title, value, icon, trend }: { title: string, value: string | number, icon: React.ReactNode, trend?: string }) {
  return (
    <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-muted-foreground font-medium text-sm">{title}</h4>
        <div className="p-2 bg-muted rounded-xl">{icon}</div>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-display font-bold">{value}</div>
        {trend && <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md">{trend}</span>}
      </div>
    </div>
  )
}
