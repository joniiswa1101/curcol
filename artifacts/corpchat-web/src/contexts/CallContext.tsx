import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { getSharedWebSocket } from "@/hooks/use-websocket";

type CallType = "voice" | "video";
type CallStatus = "idle" | "ringing" | "outgoing" | "connected" | "ended";

interface CallState {
  status: CallStatus;
  callId: number | null;
  callType: CallType;
  remoteUserId: number | null;
  remoteUserName: string | null;
  remoteUserAvatar: string | null;
  conversationId: number | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaker: boolean;
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
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const CallContext = createContext<CallContextType | null>(null);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const initialState: CallState = {
  status: "idle",
  callId: null,
  callType: "voice",
  remoteUserId: null,
  remoteUserName: null,
  remoteUserAvatar: null,
  conversationId: null,
  isMuted: false,
  isVideoOff: false,
  isSpeaker: true,
  duration: 0,
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [state, setState] = useState<CallState>(initialState);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const callStateRef = useRef(state);
  callStateRef.current = state;

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setState(initialState);
  }, []);

  const sendWs = useCallback((data: object) => {
    const ws = getSharedWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    } else {
      console.error("[Call] WebSocket not available for sending");
    }
  }, []);

  const createPeerConnection = useCallback((remoteUserId: number) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({
          type: "call_ice_candidate",
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      setRemoteStream(event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendWs]);

  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      setState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, []);

  const initiateCall = useCallback(async (params: {
    userId: number;
    userName: string;
    userAvatar?: string;
    conversationId: number;
    type: CallType;
  }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: params.type === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      setState({
        status: "outgoing",
        callId: Date.now(),
        callType: params.type,
        remoteUserId: params.userId,
        remoteUserName: params.userName,
        remoteUserAvatar: params.userAvatar || null,
        conversationId: params.conversationId,
        isMuted: false,
        isVideoOff: false,
        isSpeaker: true,
        duration: 0,
      });

      const pc = createPeerConnection(params.userId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendWs({
        type: "call_offer",
        targetUserId: params.userId,
        conversationId: params.conversationId,
        callType: params.type,
        sdp: offer.sdp,
        callerName: user?.name || user?.displayName || "Unknown",
        callerAvatar: user?.avatarUrl || null,
      });
    } catch (err) {
      console.error("[Call] Failed to initiate:", err);
      cleanup();
    }
  }, [createPeerConnection, sendWs, cleanup, user]);

  const acceptCall = useCallback(async () => {
    try {
      const callType = callStateRef.current.callType;
      const remoteUserId = callStateRef.current.remoteUserId;
      if (!remoteUserId) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = pcRef.current;
      if (!pc) return;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendWs({
        type: "call_answer",
        targetUserId: remoteUserId,
        sdp: answer.sdp,
      });

      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];

      setState(prev => ({ ...prev, status: "connected" }));
      startDurationTimer();
    } catch (err) {
      console.error("[Call] Failed to accept:", err);
      cleanup();
    }
  }, [sendWs, startDurationTimer, cleanup]);

  const rejectCall = useCallback(() => {
    const remoteUserId = callStateRef.current.remoteUserId;
    if (remoteUserId) {
      sendWs({
        type: "call_reject",
        targetUserId: remoteUserId,
      });
    }
    cleanup();
  }, [sendWs, cleanup]);

  const endCall = useCallback(() => {
    const remoteUserId = callStateRef.current.remoteUserId;
    if (remoteUserId) {
      sendWs({
        type: "call_end",
        targetUserId: remoteUserId,
      });
    }
    cleanup();
  }, [sendWs, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !t.enabled;
      });
      setState(prev => ({ ...prev, isVideoOff: !prev.isVideoOff }));
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setState(prev => ({ ...prev, isSpeaker: !prev.isSpeaker }));
  }, []);

  useEffect(() => {
    if (!user) return;

    const handleCallSignal = async (event: Event) => {
      const msg = (event as CustomEvent).detail;
      try {
        switch (msg.type) {
          case "call_offer": {
            if (callStateRef.current.status !== "idle") {
              sendWs({ type: "call_reject", targetUserId: msg.callerId });
              return;
            }
            const pc = createPeerConnection(msg.callerId);
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: "offer",
              sdp: msg.sdp,
            }));

            setState({
              status: "ringing",
              callId: Date.now(),
              callType: msg.callType || "voice",
              remoteUserId: msg.callerId,
              remoteUserName: msg.callerName || "Unknown",
              remoteUserAvatar: msg.callerAvatar || null,
              conversationId: msg.conversationId,
              isMuted: false,
              isVideoOff: false,
              isSpeaker: true,
              duration: 0,
            });
            break;
          }

          case "call_answer": {
            const pc = pcRef.current;
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription({
                type: "answer",
                sdp: msg.sdp,
              }));
              setState(prev => ({ ...prev, status: "connected" }));
              startDurationTimer();
            }
            break;
          }

          case "call_ice_candidate": {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } else {
              pendingCandidatesRef.current.push(msg.candidate);
            }
            break;
          }

          case "call_reject":
          case "call_end": {
            cleanup();
            break;
          }
        }
      } catch (err) {
        console.error("[Call] Signal handling error:", err);
      }
    };

    window.addEventListener('call-signal', handleCallSignal);
    return () => {
      window.removeEventListener('call-signal', handleCallSignal);
    };
  }, [user, createPeerConnection, startDurationTimer, cleanup, sendWs]);

  return (
    <CallContext.Provider value={{
      ...state,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleVideo,
      toggleSpeaker,
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
