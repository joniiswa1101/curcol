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
      callerName: user?.name || "Unknown",
      callerAvatar: null,
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

    let reconnectTimeout: NodeJS.Timeout | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const wsProtocol = Platform.OS === "web" ? (window.location.protocol === "https:" ? "wss:" : "ws:") : "wss:";
      const wsHost = Platform.OS === "web" ? window.location.host : domain;
      const url = `${wsProtocol}//${wsHost}/api/ws?token=${token}`;

      console.log("[Call] Connecting WS...");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Call] WS connected");
      };

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

            case "call_failed":
              cleanup();
              if (msg.reason === "user_offline") {
                if (Platform.OS === "web") {
                  window.alert("Panggilan Gagal: Pengguna tidak sedang online.");
                } else {
                  Alert.alert("Panggilan Gagal", "Pengguna tidak sedang online.");
                }
              }
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

      ws.onerror = (err) => {
        console.error("[Call] WS error:", err);
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
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
