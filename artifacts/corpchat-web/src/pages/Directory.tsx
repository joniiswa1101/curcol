import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useListUsers, useGetCicoStatuses } from "@workspace/api-client-react"
import { Avatar } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Mail, Phone, Building2 } from "lucide-react"
import { getStatusLabel } from "@/lib/utils"

export default function Directory() {
  const [search, setSearch] = useState("")
  
  // Fetch users and cico statuses (usually backend joins this, but api defines it inside user object)
  const { data, isLoading } = useListUsers({ search, limit: 50 })
  const users = data?.users || []

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
        <div className="p-8 border-b border-border bg-card/50 backdrop-blur-md shrink-0">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Employee Directory</h1>
              <p className="text-muted-foreground mt-1">Find and connect with colleagues</p>
            </div>
            <div className="w-full md:w-96 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, department..." 
                className="pl-10 h-12 rounded-xl text-base bg-background shadow-inner"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="bg-card rounded-2xl p-6 border border-border/50 animate-pulse h-64" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <UsersIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-medium">No employees found</h3>
                <p>Try adjusting your search terms.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {users.map(user => {
                  const status = user.cicoStatus?.status || 'absent';
                  
                  return (
                    <div key={user.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 group flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <Avatar 
                          src={user.avatarUrl} 
                          fallback={user.name} 
                          size="xl" 
                          status={status as any}
                          className="ring-4 ring-background shadow-md group-hover:scale-105 transition-transform" 
                        />
                        <Badge variant={status === 'present' || status === 'wfh' ? 'success' : status === 'break' ? 'warning' : 'secondary'} className="capitalize shadow-none">
                          {getStatusLabel(status)}
                        </Badge>
                      </div>
                      
                      <div className="mb-4">
                        <h3 className="text-lg font-bold text-foreground truncate">{user.name}</h3>
                        <p className="text-sm text-primary font-medium">{user.position || "Employee"}</p>
                      </div>

                      <div className="space-y-2 mt-auto pt-4 border-t border-border/50">
                        {user.department && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="w-4 h-4 shrink-0" />
                            <span className="truncate">{user.department}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-4 h-4 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-4 h-4 shrink-0" />
                            <span className="truncate">{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function UsersIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
