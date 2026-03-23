import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, Video, X, Users, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/hooks/use-auth";

interface JitsiGroupCallProps {
  roomName: string;
  conversationId: number;
  callType: "voice" | "video";
  displayName: string;
  onClose: () => void;
  isAdhoc?: boolean;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

function loadJitsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Jitsi API"));
    document.head.appendChild(script);
  });
}

export function JitsiGroupCall({ roomName, conversationId, callType, displayName, onClose, isAdhoc }: JitsiGroupCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const { user } = useAuthStore();

  const handleLeave = useCallback(async () => {
    console.log("[Jitsi] handleLeave called, user:", user);
    try {
      const token = user?.token;
      console.log("[Jitsi] Token available:", !!token);
      if (token) {
        const leaveUrl = isAdhoc
          ? `/api/calls/adhoc-call/${roomName}/leave`
          : `/api/calls/group-call/${conversationId}/leave`;
        console.log("[Jitsi] Calling leave endpoint:", leaveUrl);
        const resp = await fetch(leaveUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
          },
        });
        console.log("[Jitsi] Leave response:", resp.status);
      } else {
        console.log("[Jitsi] No token available, skipping leave call");
      }
    } catch (e) {
      console.error("[Jitsi] Leave call error:", e);
    }
    if (apiRef.current) {
      apiRef.current.dispose();
      apiRef.current = null;
    }
    onClose();
  }, [conversationId, roomName, isAdhoc, user, onClose]);

  useEffect(() => {
    let disposed = false;

    async function initJitsi() {
      try {
        await loadJitsiScript();
        if (disposed || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName: roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: callType === "voice",
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
            disableThirdPartyRequests: true,
            notifications: [],
            toolbarButtons: [
              "microphone",
              "camera",
              "desktop",
              "fullscreen",
              "hangup",
              "chat",
              "raisehand",
              "tileview",
              "select-background",
              "settings",
              "participants-pane",
            ],
            subject: " ",
            hideConferenceSubject: true,
            hideConferenceTimer: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            MOBILE_APP_PROMO: false,
            HIDE_INVITE_MORE_HEADER: true,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            DEFAULT_BACKGROUND: "#1a1a2e",
            TOOLBAR_ALWAYS_VISIBLE: true,
            FILM_STRIP_MAX_HEIGHT: 120,
          },
          userInfo: {
            displayName: displayName,
          },
        });

        apiRef.current = api;

        api.addListener("videoConferenceJoined", () => {
          setLoading(false);
          console.log("[Jitsi] Conference joined");
        });

        api.addListener("browserSupport", () => {
          setLoading(false);
        });

        const tryAutoJoinViaIframe = () => {
          try {
            const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentDocument) {
              const btns = iframe.contentDocument.querySelectorAll('button');
              btns.forEach((btn) => {
                const txt = btn.textContent || '';
                if (txt.includes('Join') || txt.includes('join')) {
                  btn.click();
                }
              });
            }
          } catch {}
        };

        setTimeout(() => {
          setLoading(false);
          tryAutoJoinViaIframe();
        }, 3000);

        setTimeout(() => tryAutoJoinViaIframe(), 5000);

        api.addListener("participantJoined", () => {
          setParticipantCount(prev => prev + 1);
        });

        api.addListener("participantLeft", () => {
          setParticipantCount(prev => Math.max(1, prev - 1));
        });

        api.addListener("videoConferenceLeft", () => {
          console.log("[Jitsi] Conference left");
          handleLeave();
        });

        api.addListener("readyToClose", () => {
          console.log("[Jitsi] Ready to close");
          handleLeave();
        });
      } catch (err) {
        console.error("[Jitsi] Init error:", err);
        setError("Gagal memuat Jitsi Meet. Coba lagi.");
        setLoading(false);
      }
    }

    initJitsi();

    return () => {
      disposed = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [roomName, callType, displayName, handleLeave]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-xl mb-4">{error}</p>
          <Button onClick={onClose} variant="destructive" size="lg">
            Tutup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 pointer-events-none">
          <div className="text-center text-white">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg">Menghubungkan ke {callType === "video" ? "video" : "voice"} call...</p>
            <p className="text-sm text-gray-400 mt-2">Room: {roomName}</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-1 w-full" />
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <div className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2 text-white text-sm">
          <Users className="w-4 h-4" />
          <span>{participantCount}</span>
        </div>
        <Button
          onClick={handleLeave}
          variant="destructive"
          size="sm"
          className="rounded-full"
        >
          <PhoneOff className="w-4 h-4 mr-1" />
          Keluar
        </Button>
      </div>
    </div>
  );
}

interface GroupCallBannerProps {
  conversationId: number;
  roomName: string;
  callType: "voice" | "video";
  startedByName: string;
  participants: Array<{ userId: number; userName: string }>;
  onJoin: () => void;
  onDismiss: () => void;
}

export function GroupCallBanner({ 
  roomName, callType, startedByName, participants, onJoin, onDismiss 
}: GroupCallBannerProps) {
  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mx-4 my-2 flex items-center justify-between animate-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          {callType === "video" ? (
            <Video className="w-5 h-5 text-primary" />
          ) : (
            <Phone className="w-5 h-5 text-primary" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">
            {startedByName} memulai {callType === "video" ? "video" : "voice"} call
          </p>
          <p className="text-xs text-muted-foreground">
            {participants.length} peserta aktif
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onJoin} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
          <Phone className="w-4 h-4 mr-1" />
          Gabung
        </Button>
        <Button onClick={onDismiss} variant="ghost" size="sm">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
