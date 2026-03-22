import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { onCallSignal, sendCallMessage } from "@/lib/call-signal-bus";

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
  isVideoOff: boolean;
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

const INITIAL: CallState = {
  status: "idle",
  callType: "voice",
  remoteUserId: null,
  remoteUserName: null,
  remoteUserAvatar: null,
  conversationId: null,
  isMuted: false,
  isVideoOff: false,
  duration: 0,
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [state, setState] = useState<CallState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  
  // Ringtone refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorRef = useRef<OscillatorNode | null>(null);
  const ringtoneGainRef = useRef<GainNode | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playRingtone = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      
      // Create oscillator and gain for ringtone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.value = 440; // A4 note
      gain.gain.setValueAtTime(0.3, now);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      
      ringtoneOscillatorRef.current = osc;
      ringtoneGainRef.current = gain;
      
      // Ring pattern: 0.5s on, 0.5s off
      let isOn = true;
      ringtoneIntervalRef.current = setInterval(() => {
        if (isOn) {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        } else {
          gain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.1);
        }
        isOn = !isOn;
      }, 500);
      
      console.log("[Call] Ringtone started");
    } catch (err) {
      console.warn("[Call] Ringtone failed:", err);
    }
  }, []);

  const stopRingtone = useCallback(() => {
    try {
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      if (ringtoneOscillatorRef.current) {
        ringtoneOscillatorRef.current.stop();
        ringtoneOscillatorRef.current = null;
      }
      if (ringtoneGainRef.current) {
        ringtoneGainRef.current = null;
      }
      console.log("[Call] Ringtone stopped");
    } catch (err) {
      console.warn("[Call] Stop ringtone failed:", err);
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log("[Call] Cleanup");
    stopRingtone();
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
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    setState(INITIAL);
  }, [stopRingtone]);

  const send = useCallback((data: object) => {
    console.log("[Call] Sending:", (data as any).type);
    sendCallMessage(data);
  }, []);

  const makePeerConnection = useCallback((targetUserId: number) => {
    console.log("[Call] Creating PeerConnection for user:", targetUserId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          type: "call_ice_candidate",
          targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      console.log("[Call] Remote track received:", e.track.kind, "readyState:", e.track.readyState, "streams:", e.streams.length);
      if (e.streams && e.streams[0]) {
        console.log("[Call] Using browser-native stream, tracks:", e.streams[0].getTracks().map(t => `${t.kind}:${t.readyState}`).join(", "));
        setRemoteStream(e.streams[0]);
      } else {
        const stream = new MediaStream([e.track]);
        console.log("[Call] Created manual stream for track:", e.track.kind);
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
        console.log("[Call] ICE connected! Re-triggering remote stream for UI refresh");
        const receivers = pc.getReceivers();
        const tracks = receivers.map(r => r.track).filter(Boolean);
        if (tracks.length > 0) {
          const refreshedStream = new MediaStream(tracks);
          setRemoteStream(refreshedStream);
        }
      }
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        const remote = stateRef.current.remoteUserId;
        if (remote) send({ type: "call_end", targetUserId: remote });
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [send, cleanup]);

  const startTimer = useCallback(() => {
    durationRef.current = setInterval(() => {
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
        isVideoOff: false,
        duration: 0,
      });

      const pc = makePeerConnection(params.userId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      send({
        type: "call_offer",
        targetUserId: params.userId,
        conversationId: params.conversationId,
        callType: params.type,
        sdp: offer.sdp,
        callerName: user?.name || user?.displayName || "Unknown",
        callerAvatar: user?.avatarUrl || null,
      });

      console.log("[Call] Offer sent to user:", params.userId);
    } catch (err) {
      console.error("[Call] initiateCall failed:", err);
      cleanup();
    }
  }, [makePeerConnection, send, cleanup, user]);

  const acceptCall = useCallback(async () => {
    const { callType, remoteUserId } = stateRef.current;
    if (!remoteUserId) return;
    console.log("[Call] Accepting call from user:", remoteUserId);
    
    stopRingtone();

    try {
      // ALWAYS capture media stream for audio transmission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      console.log("[Call] Media stream captured:", stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(", "));

      const pc = pcRef.current;
      const isSimpleCall = !pc || !pc.remoteDescription;

      if (isSimpleCall) {
        // Simple call mode - no WebRTC SDP negotiation
        console.log("[Call] Simple call mode: sending basic answer without SDP");
        send({
          type: "call_answer",
          targetUserId: remoteUserId,
          sdp: "web-call-answer",
        });

        setState(prev => ({ ...prev, status: "connected" }));
        startTimer();
        console.log("[Call] Simple call accepted and connected");
        return;
      }

      // Full WebRTC mode - add tracks and send SDP answer
      stream.getTracks().forEach(t => {
        console.log("[Call] Adding track to PC:", t.kind);
        pc.addTrack(t, stream);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      send({
        type: "call_answer",
        targetUserId: remoteUserId,
        sdp: answer.sdp,
      });

      for (const c of iceCandidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      iceCandidateQueue.current = [];

      setState(prev => ({ ...prev, status: "connected" }));
      startTimer();
      console.log("[Call] WebRTC call accepted and connected");
    } catch (err) {
      console.error("[Call] acceptCall failed:", err);
      cleanup();
    }
  }, [send, startTimer, cleanup, stopRingtone]);

  const rejectCall = useCallback(() => {
    const remote = stateRef.current.remoteUserId;
    console.log("[Call] Rejecting call from:", remote);
    stopRingtone();
    if (remote) send({ type: "call_reject", targetUserId: remote });
    cleanup();
  }, [send, cleanup, stopRingtone]);

  const endCall = useCallback(() => {
    const remote = stateRef.current.remoteUserId;
    console.log("[Call] Ending call with:", remote);
    if (remote) send({ type: "call_end", targetUserId: remote });
    cleanup();
  }, [send, cleanup]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setState(prev => ({ ...prev, isVideoOff: !prev.isVideoOff }));
  }, []);

  const toggleSpeaker = useCallback(() => {}, []);

  useEffect(() => {
    console.log("[Call] Setting up call signal handler");

    const unsubscribe = onCallSignal(async (msg) => {
      console.log("[Call] Received signal:", msg.type, "current status:", stateRef.current.status);

      try {
        switch (msg.type) {
          case "call_offer": {
            if (stateRef.current.status !== "idle") {
              console.log("[Call] Busy or duplicate, ignoring");
              return;
            }

            console.log("[Call] Incoming call from:", msg.callerName, "(userId:", msg.callerId, ")");

            const isSimpleCall = !msg.sdp || msg.sdp === "mobile-call-offer";

            if (!isSimpleCall) {
              try {
                const pc = makePeerConnection(msg.callerId);
                await pc.setRemoteDescription(new RTCSessionDescription({
                  type: "offer",
                  sdp: msg.sdp,
                }));
              } catch (err) {
                console.warn("[Call] WebRTC setup failed, falling back to simple call:", err);
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
              isVideoOff: false,
              duration: 0,
            });
            console.log("[Call] State set to RINGING", isSimpleCall ? "(simple call)" : "(WebRTC)");
            break;
          }

          case "call_answer": {
            console.log("[Call] Received answer");
            const pc = pcRef.current;
            const isSimpleAnswer = !msg.sdp || msg.sdp === "mobile-call-answer" || msg.sdp === "web-call-answer";

            if (isSimpleAnswer || !pc) {
              setState(prev => ({ ...prev, status: "connected" }));
              startTimer();
              console.log("[Call] Simple call connected");
            } else {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription({
                  type: "answer",
                  sdp: msg.sdp,
                }));
                setState(prev => ({ ...prev, status: "connected" }));
                startTimer();
                console.log("[Call] WebRTC call connected");
              } catch (err) {
                console.warn("[Call] WebRTC answer failed, falling back:", err);
                setState(prev => ({ ...prev, status: "connected" }));
                startTimer();
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

          case "call_failed": {
            console.log("[Call] Call failed, reason:", msg.reason);
            cleanup();
            if (msg.reason === "user_offline") {
              alert("Pengguna tidak sedang online. Tidak dapat melakukan panggilan.");
            }
            break;
          }

          case "call_reject":
          case "call_end": {
            console.log("[Call] Remote ended/rejected");
            cleanup();
            break;
          }
        }
      } catch (err) {
        console.error("[Call] Signal handler error:", err);
      }
    });

    return unsubscribe;
  }, [makePeerConnection, startTimer, cleanup, send]);

  // Manage ringtone based on call status
  useEffect(() => {
    if (state.status === "ringing") {
      console.log("[Call] Status changed to RINGING, playing ringtone");
      playRingtone();
    } else {
      console.log("[Call] Status changed from ringing, stopping ringtone");
      stopRingtone();
    }
  }, [state.status, playRingtone, stopRingtone]);

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
