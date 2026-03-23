import { Link, useLocation } from "wouter";
import {
  MessageSquare,
  Users,
  Megaphone,
  ShieldAlert,
  LogOut,
  Settings,
  Clock,
  Phone,
  X,
  UserCog,
  MessageCircle,
  Sun,
  Moon,
  ClipboardList,
  Shield,
  Palette,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCicoCheckIn, useCicoCheckOut } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, checkAuth } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [waNumber, setWaNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const checkInMutation = useCicoCheckIn({
    mutation: {
      onSuccess: () => {
        checkAuth();
        queryClient.invalidateQueries({ queryKey: ["/api/cico/status"] });
        toast({ title: "Checked in successfully" });
      },
    },
  });

  const checkOutMutation = useCicoCheckOut({
    mutation: {
      onSuccess: () => {
        checkAuth();
        queryClient.invalidateQueries({ queryKey: ["/api/cico/status"] });
        toast({ title: "Checked out successfully" });
      },
    },
  });

  const navItems = [
    { icon: MessageSquare, label: "Chat", path: "/chat" },
    { icon: Users, label: "Directory", path: "/directory" },
    { icon: Megaphone, label: "Announcements", path: "/announcements" },
    { icon: ClipboardList, label: "Tasks", path: "/tasks" },
    { icon: Palette, label: "Canvas", path: "/canvas" },
    { icon: Sparkles, label: "AI Digest", path: "/digest" },
    ...(user?.role === "admin"
      ? [
          { icon: Shield, label: "Compliance", path: "/compliance" },
          { icon: ShieldAlert, label: "Admin", path: "/admin" },
          { icon: UserCog, label: "Kelola User", path: "/admin/users" },
          { icon: MessageCircle, label: "WhatsApp", path: "/admin/whatsapp" },
        ]
      : []),
  ];

  const handleCicoToggle = () => {
    if (!user) return;
    const isCheckedIn =
      user.cicoStatus?.status === "present" ||
      user.cicoStatus?.status === "wfh";

    if (isCheckedIn) {
      checkOutMutation.mutate({ data: { employeeId: user.employeeId } });
    } else {
      checkInMutation.mutate({
        data: { employeeId: user.employeeId, type: "office" },
      });
    }
  };

  const openProfile = () => {
    setWaNumber((user as any)?.whatsappNumber || "");
    setIsProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: waNumber || null }),
      });
      checkAuth();
      toast({ title: "Profil berhasil disimpan" });
      setIsProfileOpen(false);
    } catch {
      toast({ title: "Gagal menyimpan profil", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Nav */}
      <nav className="w-20 lg:w-64 flex flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground pt-6 pb-6 flex-shrink-0 transition-all duration-300">
        <div className="flex flex-col items-center lg:items-start px-4 overflow-y-auto flex-1">
          <div className="flex flex-col items-center gap-0 mb-4 lg:px-2">
            <img
              src="/logo-2-white.svg"
              alt="CurCol Logo"
              className="w-72 h-22 shrink-0 rounded-xl"
            />
            <span className="text-xs text-sidebar-foreground/50">v1.9.9</span>
          </div>

          <div className="flex flex-col w-full gap-1">
            {navItems.map((item) => {
              const isActive = location.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
                    isActive
                      ? "bg-sidebar-active/10 text-sidebar-active font-semibold shadow-inner"
                      : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isActive && "text-sidebar-active",
                    )}
                  />
                  <span className="hidden lg:block">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center lg:items-start px-4 gap-2 flex-shrink-0">
          {/* CICO Quick Action */}
          <button
            onClick={handleCicoToggle}
            disabled={checkInMutation.isPending || checkOutMutation.isPending}
            className="w-full flex items-center justify-center lg:justify-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sidebar-foreground/80 group disabled:opacity-50 flex-shrink-0"
          >
            <Clock className="h-5 w-5 shrink-0 group-hover:text-accent transition-colors" />
            <span className="hidden lg:block text-sm">
              {user?.cicoStatus?.status === "present" ||
              user?.cicoStatus?.status === "wfh"
                ? "Check Out"
                : "Check In"}
            </span>
          </button>

          <div className="w-full h-px bg-white/10 flex-shrink-0" />

          <button
            onClick={openProfile}
            className="w-full flex flex-col lg:flex-row lg:items-center gap-3 hover:opacity-80 transition-opacity text-left px-2"
          >
            <Avatar
              src={user?.avatarUrl}
              fallback={user?.name || "User"}
              status={user?.cicoStatus?.status as any}
              className="ring-2 ring-white/10"
            />
            <div className="hidden lg:flex flex-col">
              <span className="text-sm font-semibold text-white truncate max-w-[100px]">
                {user?.name}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-sidebar-foreground/60 capitalize">
                  {user?.role}
                </span>
                {(user as any)?.whatsappNumber && (
                  <Phone
                    className="w-3 h-3 text-green-400"
                    title="WhatsApp terdaftar"
                  />
                )}
              </div>
            </div>
          </button>

          <div className="flex items-center justify-center lg:justify-start gap-2 w-full flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/60 hover:text-white transition-colors shrink-0"
              title={theme === "dark" ? "Light Mode" : "Dark Mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={openProfile}
              className="p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/60 hover:text-white transition-colors shrink-0"
              title="Pengaturan Profil"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/60 hover:text-destructive transition-colors shrink-0"
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

      {/* Profile Settings Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogHeader>
          <DialogTitle>Pengaturan Profil</DialogTitle>
          <DialogDescription>
            Kelola informasi akun dan notifikasi WhatsApp kamu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSaveProfile} className="space-y-5 mt-4">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
            <Avatar
              src={user?.avatarUrl}
              fallback={user?.name || "U"}
              size="lg"
            />
            <div>
              <p className="font-bold text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground">
                {(user as any)?.email}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {user?.role} • {(user as any)?.department || "–"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-500" />
              Nomor WhatsApp untuk Notifikasi
            </label>
            <Input
              type="tel"
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="Contoh: 6281234567890 (tanpa +)"
            />
            <p className="text-xs text-muted-foreground">
              Isi nomor ini agar kamu bisa terima notifikasi pengumuman penting
              langsung di WhatsApp. Format: kode negara + nomor (contoh:
              6281234567890).
            </p>
          </div>

          {(user as any)?.whatsappNumber && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl text-sm">
              <Phone className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-green-700 dark:text-green-400">
                WhatsApp aktif: <strong>+{(user as any).whatsappNumber}</strong>
              </span>
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsProfileOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
