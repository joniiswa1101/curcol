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
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const CallContext = createContext<CallContextType | null>(null);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    console.log("[Call] Cleanup");
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    iceCandidateQueue.current = [];
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

  const makePeerConnection = useCallback((targetUserId: number) => {
    console.log("[Call] Creating PeerConnection for user:", targetUserId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWs({
          type: "call_ice_candidate",
          targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      console.log("[Call] Remote track received:", e.track.kind);
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        const stream = new MediaStream([e.track]);
        setRemoteStream(prev => {
          if (prev) {
            prev.addTrack(e.track);
            return new MediaStream(prev.getTracks());
          }
          return stream;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Call] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        const receivers = pc.getReceivers();
        const tracks = receivers.map(r => r.track).filter(Boolean);
        if (tracks.length > 0) {
          setRemoteStream(new MediaStream(tracks));
        }
      }
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        const remote = callStateRef.current.remoteUserId;
        if (remote) sendWs({ type: "call_end", targetUserId: remote });
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendWs, cleanup]);

  const initiateCall = useCallback(async (params: {
    userId: number;
    userName: string;
    userAvatar?: string;
    conversationId: number;
    type: CallType;
  }) => {
    console.log("[Call] Initiating call to user:", params.userId, "type:", params.type);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: params.type === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

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

      const pc = makePeerConnection(params.userId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendWs({
        type: "call_offer",
        targetUserId: params.userId,
        conversationId: params.conversationId,
        callType: params.type,
        sdp: offer.sdp,
        callerName: user?.name || "Unknown",
        callerAvatar: null,
      });

      console.log("[Call] WebRTC offer sent");
    } catch (err) {
      console.error("[Call] initiateCall failed:", err);
      cleanup();
    }
  }, [makePeerConnection, sendWs, cleanup, user]);

  const acceptCall = useCallback(async () => {
    const { callType, remoteUserId } = callStateRef.current;
    if (!remoteUserId) return;
    console.log("[Call] Accepting call from user:", remoteUserId);

    try {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        sendWs({
          type: "call_answer",
          targetUserId: remoteUserId,
          sdp: "mobile-call-answer",
        });
        setState(prev => ({ ...prev, status: "connected" }));
        startDurationTimer();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendWs({
        type: "call_answer",
        targetUserId: remoteUserId,
        sdp: answer.sdp,
      });

      for (const c of iceCandidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      iceCandidateQueue.current = [];

      setState(prev => ({ ...prev, status: "connected" }));
      startDurationTimer();
      console.log("[Call] WebRTC call accepted");
    } catch (err) {
      console.error("[Call] acceptCall failed:", err);
      cleanup();
    }
  }, [sendWs, startDurationTimer, cleanup]);

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
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
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

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "call_offer": {
              if (callStateRef.current.status !== "idle") {
                sendWs({ type: "call_reject", targetUserId: msg.callerId });
                return;
              }

              console.log("[Call] Incoming call from:", msg.callerName);
              const isSimpleCall = !msg.sdp || msg.sdp === "mobile-call-offer";

              if (!isSimpleCall) {
                try {
                  const pc = makePeerConnection(msg.callerId);
                  await pc.setRemoteDescription(new RTCSessionDescription({
                    type: "offer",
                    sdp: msg.sdp,
                  }));
                } catch (err) {
                  console.warn("[Call] WebRTC setup failed:", err);
                }
              }

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
            }

            case "call_answer": {
              console.log("[Call] Received answer");
              const pc = pcRef.current;
              const isSimpleAnswer = !msg.sdp || msg.sdp === "mobile-call-answer" || msg.sdp === "web-call-answer";

              if (isSimpleAnswer || !pc) {
                setState(prev => ({ ...prev, status: "connected" }));
                startDurationTimer();
              } else {
                try {
                  await pc.setRemoteDescription(new RTCSessionDescription({
                    type: "answer",
                    sdp: msg.sdp,
                  }));
                  setState(prev => ({ ...prev, status: "connected" }));
                  startDurationTimer();
                  console.log("[Call] WebRTC connected");
                } catch (err) {
                  console.warn("[Call] WebRTC answer failed:", err);
                  setState(prev => ({ ...prev, status: "connected" }));
                  startDurationTimer();
                }
              }
              break;
            }

            case "call_ice_candidate": {
              const pc = pcRef.current;
              if (pc?.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } else {
                iceCandidateQueue.current.push(msg.candidate);
              }
              break;
            }

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
  }, [token, user, startDurationTimer, cleanup, makePeerConnection, sendWs]);

  return (
    <CallContext.Provider value={{
      ...state,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      localStream,
      remoteStream,
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
