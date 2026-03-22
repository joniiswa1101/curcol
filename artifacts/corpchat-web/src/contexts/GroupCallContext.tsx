import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { onGroupCallSignal } from "@/lib/group-call-bus";
import { JitsiGroupCall } from "@/components/call/JitsiGroupCall";

interface GroupCallRoom {
  roomName: string;
  conversationId: number;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
  startedAt: string;
  participants: Array<{ userId: number; userName: string; joinedAt: string }>;
}

interface IncomingGroupCall {
  conversationId: number;
  roomName: string;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
}

interface GroupCallContextType {
  activeCall: GroupCallRoom | null;
  incomingCall: IncomingGroupCall | null;
  isInCall: boolean;
  startGroupCall: (conversationId: number, callType: "voice" | "video") => Promise<void>;
  joinGroupCall: (conversationId: number) => Promise<void>;
  leaveGroupCall: () => void;
  dismissIncoming: (conversationId: number) => void;
  checkActiveCall: (conversationId: number) => Promise<GroupCallRoom | null>;
}

const GroupCallContext = createContext<GroupCallContextType | null>(null);

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error("useGroupCall must be used within GroupCallProvider");
  return ctx;
}

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const token = useAuthStore(state => state.token);
  const [activeCall, setActiveCall] = useState<GroupCallRoom | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingGroupCall | null>(null);

  useEffect(() => {
    const unsubscribe = onGroupCallSignal((data) => {
      if (data.type === "group_call_started") {
        if (isInCall) return;
        setIncomingCall({
          conversationId: data.conversationId,
          roomName: data.roomName,
          callType: data.callType,
          startedBy: data.startedBy,
          startedByName: data.startedByName,
        });
      } else if (data.type === "group_call_ended") {
        if (activeCall?.roomName === data.roomName) {
          setActiveCall(null);
          setIsInCall(false);
        }
        if (incomingCall?.roomName === data.roomName) {
          setIncomingCall(null);
        }
      } else if (data.type === "group_call_joined") {
        if (activeCall?.conversationId === data.conversationId) {
          setActiveCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
      } else if (data.type === "group_call_left") {
        if (activeCall?.conversationId === data.conversationId) {
          setActiveCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
      }
    });
    return unsubscribe;
  }, [isInCall, activeCall, incomingCall]);

  const startGroupCall = useCallback(async (conversationId: number, callType: "voice" | "video") => {
    if (!token) return;
    try {
      const res = await fetch(`/api/calls/group-call/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ callType }),
      });
      const data = await res.json();
      if (data.room) {
        if (!data.isNew) {
          await fetch(`/api/calls/group-call/${conversationId}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          });
        }
        setActiveCall(data.room);
        setIsInCall(true);
        setIncomingCall(null);
      }
    } catch (err) {
      console.error("[GroupCall] Start error:", err);
    }
  }, [token]);

  const joinGroupCall = useCallback(async (conversationId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/calls/group-call/${conversationId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.room) {
        setActiveCall(data.room);
        setIsInCall(true);
        setIncomingCall(null);
      }
    } catch (err) {
      console.error("[GroupCall] Join error:", err);
    }
  }, [token]);

  const leaveGroupCall = useCallback(() => {
    setActiveCall(null);
    setIsInCall(false);
  }, []);

  const dismissIncoming = useCallback((conversationId: number) => {
    if (incomingCall?.conversationId === conversationId) {
      setIncomingCall(null);
    }
  }, [incomingCall]);

  const checkActiveCall = useCallback(async (conversationId: number): Promise<GroupCallRoom | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/calls/group-call/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.active ? data.room : null;
    } catch {
      return null;
    }
  }, [token]);

  const displayName = user?.name || user?.displayName || "User";

  return (
    <GroupCallContext.Provider value={{
      activeCall,
      incomingCall,
      isInCall,
      startGroupCall,
      joinGroupCall,
      leaveGroupCall,
      dismissIncoming,
      checkActiveCall,
    }}>
      {children}
      {isInCall && activeCall && (
        <JitsiGroupCall
          roomName={activeCall.roomName}
          conversationId={activeCall.conversationId}
          callType={activeCall.callType}
          displayName={displayName}
          onClose={leaveGroupCall}
        />
      )}
    </GroupCallContext.Provider>
  );
}
