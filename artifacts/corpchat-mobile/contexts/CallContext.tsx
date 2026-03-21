import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Platform, Alert } from "react-native";

type CallType = "voice" | "video";
type CallStatus = "idle" | "ringing" | "outgoing" | "connected" | "ended";

interface CallState {
  status: CallStatus;
  callType: CallType;
  remoteUserId: number | null;
  remoteUserName: string | null;
  remoteUserAvatar: string | null;
  conversationId: number | null;
  isMuted: boolean;
  duration: number;
}

interface CallContextType extends CallState {
  initiateCall: (params: {
    userId: number;
    userName: string;
    userAvatar?: string;
    conversationId: number;
    type: CallType;
  }) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [state, setState] = useState<CallState>({
    status: "idle",
    callType: "voice",
    remoteUserId: null,
    remoteUserName: null,
    remoteUserAvatar: null,
    conversationId: null,
    isMuted: false,
    duration: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callStateRef = useRef(state);
  callStateRef.current = state;

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setState({
      status: "idle",
      callType: "voice",
      remoteUserId: null,
      remoteUserName: null,
      remoteUserAvatar: null,
      conversationId: null,
      isMuted: false,
      duration: 0,
    });
  }, []);

  const sendWs = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      setState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, []);

  const initiateCall = useCallback((params: {
    userId: number;
    userName: string;
    userAvatar?: string;
    conversationId: number;
    type: CallType;
  }) => {
    setState({
      status: "outgoing",
      callType: params.type,
      remoteUserId: params.userId,
      remoteUserName: params.userName,
      remoteUserAvatar: params.userAvatar || null,
      conversationId: params.conversationId,
      isMuted: false,
      duration: 0,
    });

    sendWs({
      type: "call_offer",
      targetUserId: params.userId,
      conversationId: params.conversationId,
      callType: params.type,
      sdp: "mobile-call-offer",
      callerName: user?.displayName || "Unknown",
      callerAvatar: user?.avatarUrl || null,
    });
  }, [sendWs, user]);

  const acceptCall = useCallback(() => {
    const remoteUserId = callStateRef.current.remoteUserId;
    if (!remoteUserId) return;

    sendWs({
      type: "call_answer",
      targetUserId: remoteUserId,
      sdp: "mobile-call-answer",
    });

    setState(prev => ({ ...prev, status: "connected" }));
    startDurationTimer();
  }, [sendWs, startDurationTimer]);

  const rejectCall = useCallback(() => {
    const remoteUserId = callStateRef.current.remoteUserId;
    if (remoteUserId) {
      sendWs({ type: "call_reject", targetUserId: remoteUserId });
    }
    cleanup();
  }, [sendWs, cleanup]);

  const endCall = useCallback(() => {
    const remoteUserId = callStateRef.current.remoteUserId;
    if (remoteUserId) {
      sendWs({ type: "call_end", targetUserId: remoteUserId });
    }
    cleanup();
  }, [sendWs, cleanup]);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;

    const url = `wss://${domain}/api/ws?token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "call_offer":
            setState({
              status: "ringing",
              callType: msg.callType || "voice",
              remoteUserId: msg.callerId,
              remoteUserName: msg.callerName || "Unknown",
              remoteUserAvatar: msg.callerAvatar || null,
              conversationId: msg.conversationId,
              isMuted: false,
              duration: 0,
            });
            break;

          case "call_answer":
            setState(prev => ({ ...prev, status: "connected" }));
            startDurationTimer();
            break;

          case "call_reject":
          case "call_end":
            cleanup();
            break;
        }
      } catch (err) {
        console.error("[Call] WS message error:", err);
      }
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, user, startDurationTimer, cleanup]);

  return (
    <CallContext.Provider value={{
      ...state,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
