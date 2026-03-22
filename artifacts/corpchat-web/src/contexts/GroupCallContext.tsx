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

interface AdhocCallRoom {
  roomName: string;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
  startedAt: string;
  invitedUserIds: number[];
  participants: Array<{ userId: number; userName: string; joinedAt: string }>;
}

interface IncomingGroupCall {
  conversationId?: number;
  roomName: string;
  callType: "voice" | "video";
  startedBy: number;
  startedByName: string;
  isAdhoc?: boolean;
}

interface GroupCallContextType {
  activeCall: GroupCallRoom | null;
  activeAdhocCall: AdhocCallRoom | null;
  incomingCall: IncomingGroupCall | null;
  isInCall: boolean;
  startGroupCall: (conversationId: number, callType: "voice" | "video") => Promise<void>;
  startAdhocCall: (room: AdhocCallRoom) => void;
  joinGroupCall: (conversationId: number) => Promise<void>;
  joinAdhocCall: (roomName: string) => Promise<void>;
  leaveGroupCall: () => void;
  dismissIncoming: (conversationId?: number, roomName?: string) => void;
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
  const [activeAdhocCall, setActiveAdhocCall] = useState<AdhocCallRoom | null>(null);
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
      } else if (data.type === "adhoc_call_started") {
        if (isInCall) return;
        setIncomingCall({
          roomName: data.roomName,
          callType: data.callType,
          startedBy: data.startedBy,
          startedByName: data.startedByName,
          isAdhoc: true,
        });
      } else if (data.type === "group_call_ended" || data.type === "adhoc_call_ended") {
        if (activeCall?.roomName === data.roomName) {
          setActiveCall(null);
          setIsInCall(false);
        }
        if (activeAdhocCall?.roomName === data.roomName) {
          setActiveAdhocCall(null);
          setIsInCall(false);
        }
        if (incomingCall?.roomName === data.roomName) {
          setIncomingCall(null);
        }
      } else if (data.type === "group_call_joined" || data.type === "adhoc_call_joined") {
        if (activeCall?.conversationId === data.conversationId && data.conversationId) {
          setActiveCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
        if (activeAdhocCall?.roomName === data.roomName) {
          setActiveAdhocCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
      } else if (data.type === "group_call_left" || data.type === "adhoc_call_left") {
        if (activeCall?.conversationId === data.conversationId && data.conversationId) {
          setActiveCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
        if (activeAdhocCall?.roomName === data.roomName) {
          setActiveAdhocCall(prev => prev ? { ...prev, participants: data.participants } : prev);
        }
      }
    });
    return unsubscribe;
  }, [isInCall, activeCall, activeAdhocCall, incomingCall]);

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

  const startAdhocCall = useCallback((room: AdhocCallRoom) => {
    setActiveAdhocCall(room);
    setIsInCall(true);
    setIncomingCall(null);
  }, []);

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

  const joinAdhocCall = useCallback(async (roomName: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/calls/adhoc-call/${roomName}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.room) {
        setActiveAdhocCall(data.room);
        setIsInCall(true);
        setIncomingCall(null);
      }
    } catch (err) {
      console.error("[AdhocCall] Join error:", err);
    }
  }, [token]);

  const leaveGroupCall = useCallback(() => {
    setActiveCall(null);
    setActiveAdhocCall(null);
    setIsInCall(false);
  }, []);

  const dismissIncoming = useCallback((conversationId?: number, roomName?: string) => {
    if (roomName && incomingCall?.roomName === roomName) {
      setIncomingCall(null);
    } else if (conversationId && incomingCall?.conversationId === conversationId) {
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

  const currentCall = activeCall || activeAdhocCall;
  const currentRoomName = currentCall?.roomName || "";
  const currentCallType = currentCall?.callType || "video";
  const currentConversationId = activeCall?.conversationId || 0;
  const isAdhoc = !!activeAdhocCall;

  const handleLeaveCall = useCallback(async () => {
    if (isAdhoc && activeAdhocCall && token) {
      try {
        await fetch(`/api/calls/adhoc-call/${activeAdhocCall.roomName}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    leaveGroupCall();
  }, [isAdhoc, activeAdhocCall, token, leaveGroupCall]);

  return (
    <GroupCallContext.Provider value={{
      activeCall,
      activeAdhocCall,
      incomingCall,
      isInCall,
      startGroupCall,
      startAdhocCall,
      joinGroupCall,
      joinAdhocCall,
      leaveGroupCall,
      dismissIncoming,
      checkActiveCall,
    }}>
      {children}
      {isInCall && currentCall && (
        <JitsiGroupCall
          roomName={currentRoomName}
          conversationId={currentConversationId}
          callType={currentCallType}
          displayName={displayName}
          onClose={isAdhoc ? handleLeaveCall : leaveGroupCall}
          isAdhoc={isAdhoc}
        />
      )}
    </GroupCallContext.Provider>
  );
}
