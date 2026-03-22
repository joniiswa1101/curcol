import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Platform, Alert, PermissionsAndroid } from "react-native";

let WebRTCModule: any = null;
if (Platform.OS !== "web") {
  try {
    WebRTCModule = require("react-native-webrtc");
  } catch (e) {
    console.warn("[Call] react-native-webrtc not available");
  }
}

function getRTC() {
  if (Platform.OS === "web") {
    return {
      RTCPeerConnection: (window as any).RTCPeerConnection,
      RTCSessionDescription: (window as any).RTCSessionDescription,
      RTCIceCandidate: (window as any).RTCIceCandidate,
      MediaStream: (window as any).MediaStream,
      getUserMedia: (constraints: any) => navigator.mediaDevices.getUserMedia(constraints),
    };
  }
  if (WebRTCModule) {
    return {
      RTCPeerConnection: WebRTCModule.RTCPeerConnection,
      RTCSessionDescription: WebRTCModule.RTCSessionDescription,
      RTCIceCandidate: WebRTCModule.RTCIceCandidate,
      MediaStream: WebRTCModule.MediaStream,
      getUserMedia: (constraints: any) => WebRTCModule.mediaDevices.getUserMedia(constraints),
    };
  }
  return null;
}

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
  localStream: any;
  remoteStream: any;
}

const CallContext = createContext<CallContextType | null>(null);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

async function requestMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const grants = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return (
      grants[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
      grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.error("[Call] Permission request failed:", err);
    return false;
  }
}

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

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const iceCandidateQueue = useRef<any[]>([]);

  const cleanup = useCallback(() => {
    console.log("[Call] Cleanup");
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => t.stop());
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
    const rtc = getRTC();
    if (!rtc) {
      console.error("[Call] WebRTC not available on this platform");
      return null;
    }

    console.log("[Call] Creating PeerConnection for user:", targetUserId);
    const pc = new rtc.RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e: any) => {
      if (e.candidate) {
        sendWs({
          type: "call_ice_candidate",
          targetUserId,
          candidate: Platform.OS === "web" ? e.candidate.toJSON() : {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
          },
        });
      }
    };

    pc.ontrack = (e: any) => {
      console.log("[Call] Remote track received");
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else if (rtc.MediaStream) {
        const stream = new rtc.MediaStream([e.track]);
        setRemoteStream((prev: any) => {
          if (prev) {
            prev.addTrack(e.track);
            return Platform.OS === "web" ? new rtc.MediaStream(prev.getTracks()) : prev;
          }
          return stream;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Call] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        const receivers = pc.getReceivers?.();
        if (receivers) {
          const tracks = receivers.map((r: any) => r.track).filter(Boolean);
          if (tracks.length > 0 && rtc.MediaStream) {
            setRemoteStream(new rtc.MediaStream(tracks));
          }
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
    const rtc = getRTC();
    if (!rtc) {
      Alert.alert("Tidak Tersedia", "Fitur panggilan tidak tersedia di platform ini.");
      return;
    }

    console.log("[Call] Initiating call to user:", params.userId, "type:", params.type);
    try {
      if (Platform.OS === "android") {
        const granted = await requestMediaPermissions();
        if (!granted) {
          Alert.alert("Izin Ditolak", "Izinkan akses kamera dan mikrofon untuk melakukan panggilan.");
          return;
        }
      }

      const stream = await rtc.getUserMedia({
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
      if (!pc) {
        cleanup();
        return;
      }
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

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
      Alert.alert("Gagal", "Tidak bisa memulai panggilan. Pastikan izin kamera dan mikrofon diberikan.");
      cleanup();
    }
  }, [makePeerConnection, sendWs, cleanup, user]);

  const acceptCall = useCallback(async () => {
    const rtc = getRTC();
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

      if (Platform.OS === "android") {
        const granted = await requestMediaPermissions();
        if (!granted) {
          Alert.alert("Izin Ditolak", "Izinkan akses kamera dan mikrofon untuk menerima panggilan.");
          sendWs({ type: "call_reject", targetUserId: remoteUserId });
          cleanup();
          return;
        }
      }

      const stream = rtc ? await rtc.getUserMedia({
        audio: true,
        video: callType === "video",
      }) : null;

      if (stream) {
        localStreamRef.current = stream;
        setLocalStream(stream);
        stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendWs({
        type: "call_answer",
        targetUserId: remoteUserId,
        sdp: answer.sdp,
      });

      const RtcIceCandidate = rtc?.RTCIceCandidate;
      if (RtcIceCandidate) {
        for (const c of iceCandidateQueue.current) {
          await pc.addIceCandidate(new RtcIceCandidate(c));
        }
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
    localStreamRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !t.enabled; });
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

      ws.onmessage = async (event: any) => {
        try {
          const msg = JSON.parse(event.data);
          const rtc = getRTC();

          switch (msg.type) {
            case "call_offer": {
              if (callStateRef.current.status !== "idle") {
                return;
              }

              console.log("[Call] Incoming call from:", msg.callerName);
              const isSimpleCall = !msg.sdp || msg.sdp === "mobile-call-offer";

              if (!isSimpleCall && rtc) {
                try {
                  const pc = makePeerConnection(msg.callerId);
                  if (pc) {
                    await pc.setRemoteDescription(new rtc.RTCSessionDescription({
                      type: "offer",
                      sdp: msg.sdp,
                    }));
                  }
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

              if (isSimpleAnswer || !pc || !rtc) {
                setState(prev => ({ ...prev, status: "connected" }));
                startDurationTimer();
              } else {
                try {
                  await pc.setRemoteDescription(new rtc.RTCSessionDescription({
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
              if (pc?.remoteDescription && rtc) {
                await pc.addIceCandidate(new rtc.RTCIceCandidate(msg.candidate));
              } else {
                iceCandidateQueue.current.push(msg.candidate);
              }
              break;
            }

            case "call_failed":
              cleanup();
              if (msg.reason === "user_offline") {
                Alert.alert("Panggilan Gagal", "Pengguna tidak sedang online.");
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

      ws.onerror = (err: any) => {
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
