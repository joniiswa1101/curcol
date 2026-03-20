import { useCall } from "@/contexts/CallContext";
import { useEffect, useRef } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX,
} from "lucide-react";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function ActiveCallOverlay() {
  const {
    status, callType, remoteUserName, remoteUserAvatar,
    isMuted, isVideoOff, duration,
    endCall, toggleMute, toggleVideo,
    localStream, remoteStream,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (status !== "outgoing" && status !== "connected") return null;

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-between">
      {isVideo && remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          {remoteUserAvatar ? (
            <img src={remoteUserAvatar} alt="" className="w-28 h-28 rounded-full object-cover ring-4 ring-white/10 mb-6" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold ring-4 ring-white/10 mb-6">
              {remoteUserName?.charAt(0) || "?"}
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">{remoteUserName}</h2>
          <p className="text-white/60 mt-2">
            {status === "outgoing" ? "Calling..." : formatDuration(duration)}
          </p>
        </div>
      )}

      {isVideo && localStream && (
        <div className="absolute top-6 right-6 w-32 h-44 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-10">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}

      {isVideo && status === "connected" && (
        <div className="absolute top-6 left-6 z-10 bg-black/50 px-3 py-1.5 rounded-full">
          <p className="text-white text-sm font-medium">{formatDuration(duration)}</p>
        </div>
      )}

      <div className="relative z-10 flex items-center gap-5 pb-12 pt-6">
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isMuted ? "bg-white text-gray-900" : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {isVideo && (
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isVideoOff ? "bg-white text-gray-900" : "bg-white/20 text-white hover:bg-white/30"
            }`}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}

        <button
          onClick={endCall}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
