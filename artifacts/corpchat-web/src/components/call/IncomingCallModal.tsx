import { useCall } from "@/contexts/CallContext";
import { Phone, PhoneOff, Video } from "lucide-react";

export function IncomingCallModal() {
  const { status, callType, remoteUserName, remoteUserAvatar, acceptCall, rejectCall } = useCall();

  if (status !== "ringing") return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card rounded-3xl shadow-2xl p-8 w-[340px] text-center animate-in fade-in zoom-in-95">
        <div className="relative mx-auto w-20 h-20 mb-4">
          {remoteUserAvatar ? (
            <img src={remoteUserAvatar} alt="" className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-primary/20">
              {remoteUserName?.charAt(0) || "?"}
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
            {callType === "video" ? (
              <Video className="w-3 h-3 text-white" />
            ) : (
              <Phone className="w-3 h-3 text-white" />
            )}
          </span>
        </div>

        <h3 className="text-lg font-bold text-foreground">{remoteUserName}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Incoming {callType === "video" ? "video" : "voice"} call...
        </p>

        <div className="flex items-center justify-center gap-6 mt-8">
          <button
            onClick={rejectCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          <button
            onClick={acceptCall}
            className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105 active:scale-95 animate-bounce"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
