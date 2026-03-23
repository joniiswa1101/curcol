import { useState, useEffect, useCallback } from "react";
import { X, Search, Phone, Video, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/hooks/use-auth";
import { useGroupCall } from "@/contexts/GroupCallContext";

interface User {
  id: number;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  department?: string;
}

interface AdHocCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdHocCallModal({ isOpen, onClose }: AdHocCallModalProps) {
  const { user } = useAuthStore();
  const token = useAuthStore((state) => state.token);
  const groupCallCtx = useGroupCall();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Map<number, User>>(new Map());
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const fetchUsers = useCallback(async (query: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query) params.set("search", query);
      const res = await fetch(`/api/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const userList = (data.users || data || []).filter(
        (u: any) => u.id !== user?.id
      );
      setUsers(userList);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }, [token, user?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchUsers("");
      setSelectedUsers(new Map());
      setSearch("");
    }
  }, [isOpen, fetchUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) fetchUsers(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, isOpen, fetchUsers]);

  const toggleUser = (u: User) => {
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) {
        next.delete(u.id);
      } else {
        next.set(u.id, u);
      }
      console.log("[AdHoc] User toggled:", u.name, "- now selected count:", next.size);
      return next;
    });
  };

  const startCall = async (callType: "voice" | "video") => {
    if (selectedUsers.size === 0 || !token) {
      console.log("[AdHoc] Cannot start call: selectedUsers.size=", selectedUsers.size, "token=", !!token);
      return;
    }
    setStarting(true);
    try {
      const userIds = Array.from(selectedUsers.keys());
      console.log("[AdHoc] Starting", callType, "call with userIds:", userIds);
      const res = await fetch("/api/calls/adhoc-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds, callType }),
      });
      console.log("[AdHoc] API response status:", res.status);
      const text = await res.text();
      console.log("[AdHoc] API response text:", text.substring(0, 200));
      if (res.ok) {
        const data = JSON.parse(text);
        console.log("[AdHoc] Parsed data:", data);
        if (data.room) {
          console.log("[AdHoc] Starting adhoc call with room:", data.room);
          groupCallCtx.startAdhocCall(data.room);
          onClose();
        } else {
          console.error("[AdHoc] No room in response");
        }
      } else {
        console.error("[AdHoc] API error:", res.status, text.substring(0, 500));
      }
    } catch (err) {
      console.error("[AdHoc] Start call error:", err);
    }
    setStarting(false);
  };

  if (!isOpen) return null;

  const getName = (u: User) => u.name || u.displayName || "Unknown";

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Multi-point Call</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {selectedUsers.size > 0 && (
          <div className="px-3 py-2 border-b bg-primary/5">
            <p className="text-xs text-muted-foreground mb-1.5">
              {selectedUsers.size} orang dipilih:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedUsers.values()).map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full cursor-pointer hover:bg-primary/20"
                  onClick={() => toggleUser(u)}
                >
                  {getName(u)}
                  <X className="w-3 h-3" />
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Tidak ada user ditemukan
            </div>
          ) : (
            <div className="divide-y">
              {users.map((u) => {
                const isSelected = selectedUsers.has(u.id);
                return (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                    onClick={() => toggleUser(u)}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm flex-shrink-0">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        getName(u).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getName(u)}
                      </p>
                      {u.department && (
                        <p className="text-xs text-muted-foreground truncate">
                          {u.department}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t flex gap-2">
          <Button
            onClick={() => {
              console.log("[AdHoc] Voice call clicked, selectedUsers.size:", selectedUsers.size, "starting:", starting);
              startCall("voice");
            }}
            disabled={selectedUsers.size === 0 || starting}
            className="flex-1 gap-2"
            variant="outline"
          >
            <Phone className="w-4 h-4" />
            Voice Call
          </Button>
          <Button
            onClick={() => {
              console.log("[AdHoc] Video call clicked, selectedUsers.size:", selectedUsers.size, "starting:", starting);
              startCall("video");
            }}
            disabled={selectedUsers.size === 0 || starting}
            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-white"
          >
            <Video className="w-4 h-4" />
            Video Call
          </Button>
        </div>
      </div>
    </div>
  );
}
