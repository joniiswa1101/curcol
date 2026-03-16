import { Link, useLocation } from "wouter"
import { MessageSquare, Users, Megaphone, ShieldAlert, LogOut, Settings, Clock } from "lucide-react"
import { useAuthStore } from "@/hooks/use-auth"
import { Avatar } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useCicoCheckIn, useCicoCheckOut } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const checkInMutation = useCicoCheckIn({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] })
        queryClient.invalidateQueries({ queryKey: ["/api/cico/status"] })
        toast({ title: "Checked in successfully" })
      }
    }
  })

  const checkOutMutation = useCicoCheckOut({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] })
        queryClient.invalidateQueries({ queryKey: ["/api/cico/status"] })
        toast({ title: "Checked out successfully" })
      }
    }
  })

  const navItems = [
    { icon: MessageSquare, label: "Chat", path: "/chat" },
    { icon: Users, label: "Directory", path: "/directory" },
    { icon: Megaphone, label: "Announcements", path: "/announcements" },
    ...(user?.role === "admin" ? [{ icon: ShieldAlert, label: "Admin", path: "/admin" }] : [])
  ]

  const handleCicoToggle = () => {
    if (!user) return
    const isCheckedIn = user.cicoStatus?.status === 'present' || user.cicoStatus?.status === 'wfh'
    
    if (isCheckedIn) {
      checkOutMutation.mutate({ data: { employeeId: user.employeeId } })
    } else {
      checkInMutation.mutate({ data: { employeeId: user.employeeId, type: "office" } })
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Nav */}
      <nav className="w-20 lg:w-64 flex flex-col justify-between bg-sidebar border-r border-sidebar-border text-sidebar-foreground py-6 flex-shrink-0 transition-all duration-300">
        <div className="flex flex-col items-center lg:items-start px-4">
          <div className="flex items-center gap-3 mb-8 lg:px-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <MessageSquare className="text-white h-5 w-5" />
            </div>
            <span className="hidden lg:block font-display font-bold text-xl tracking-tight text-white">CurCol</span>
          </div>

          <div className="flex flex-col w-full gap-2">
            {navItems.map((item) => {
              const isActive = location.startsWith(item.path)
              return (
                <Link key={item.path} href={item.path} className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-sidebar-active/10 text-sidebar-active font-semibold shadow-inner" 
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                )}>
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-active")} />
                  <span className="hidden lg:block">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col items-center lg:items-start px-4 gap-4">
          {/* CICO Quick Action */}
          <button 
            onClick={handleCicoToggle}
            disabled={checkInMutation.isPending || checkOutMutation.isPending}
            className="w-full flex items-center justify-center lg:justify-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sidebar-foreground/80 group disabled:opacity-50"
          >
            <Clock className="h-5 w-5 shrink-0 group-hover:text-accent transition-colors" />
            <span className="hidden lg:block text-sm">
              {user?.cicoStatus?.status === 'present' ? 'Check Out' : 'Check In'}
            </span>
          </button>

          <div className="w-full h-px bg-white/10" />

          <div className="flex items-center justify-between w-full lg:px-2">
            <div className="flex items-center gap-3">
              <Avatar 
                src={user?.avatarUrl} 
                fallback={user?.name || "User"} 
                status={user?.cicoStatus?.status as any}
                className="ring-2 ring-white/10"
              />
              <div className="hidden lg:flex flex-col">
                <span className="text-sm font-semibold text-white truncate max-w-[120px]">{user?.name}</span>
                <span className="text-xs text-sidebar-foreground/60 capitalize">{user?.role}</span>
              </div>
            </div>
            <button 
              onClick={logout}
              className="hidden lg:flex p-2 rounded-lg hover:bg-white/10 text-sidebar-foreground/60 hover:text-destructive transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  )
}
