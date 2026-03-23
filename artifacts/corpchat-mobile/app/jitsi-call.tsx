import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  BackHandler,
  Alert,
  useColorScheme,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function JitsiCallScreen() {
  const { roomName, callType, conversationId } = useLocalSearchParams<{
    roomName: string;
    callType: string;
    conversationId: string;
  }>();
  const { user, token } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayName = user?.name || "User";
  const isVoiceOnly = callType === "voice";

  const isAdhoc = conversationId === "adhoc";

  useEffect(() => {
    const joinRoom = async () => {
      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const baseUrl = domain ? `https://${domain}` : "";
        if (token && conversationId) {
          const joinUrl = isAdhoc
            ? `${baseUrl}/api/calls/adhoc-call/${roomName}/join`
            : `${baseUrl}/api/calls/group-call/${conversationId}/join`;
          const resp = await fetch(joinUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            setError(errData.error || "Tidak bisa bergabung ke panggilan");
            return;
          }
        }
      } catch (e) {
        console.error("[Jitsi] Join error:", e);
        setError("Gagal menghubungkan ke panggilan");
      }
    };
    joinRoom();
  }, [conversationId, token, roomName, isAdhoc];

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleLeave();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const handleLeave = async () => {
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      if (token && conversationId) {
        const leaveUrl = isAdhoc
          ? `${baseUrl}/api/calls/adhoc-call/${roomName}/leave`
          : `${baseUrl}/api/calls/group-call/${conversationId}/leave`;
        await fetch(leaveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (e) {
      console.error("[Jitsi] Leave error:", e);
    }
    router.back();
  };

  const jitsiUrl = `https://meet.jit.si/${roomName}#config.startWithAudioMuted=false&config.startWithVideoMuted=${isVoiceOnly}&config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.enableWelcomePage=false&config.enableClosePage=false&userInfo.displayName=${encodeURIComponent(displayName)}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const injectedJS = `
    (function() {
      document.addEventListener('readystatechange', function() {
        if (document.readyState === 'complete') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded' }));
        }
      });
      function tryClickJoin() {
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          var txt = btns[i].textContent || '';
          if (txt.indexOf('Join') >= 0 || txt.indexOf('join') >= 0) {
            btns[i].click();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_joined' }));
            return true;
          }
        }
        return false;
      }
      var attempts = 0;
      var joinInterval = setInterval(function() {
        attempts++;
        if (tryClickJoin() || attempts > 20) {
          clearInterval(joinInterval);
        }
      }, 1000);
    })();
    true;
  `;

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centerContent}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Kembali</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#000" }]}>
      <StatusBar barStyle="light-content" />
      {loading && (
        <View style={[styles.loadingOverlay, { pointerEvents: "none" }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            Menghubungkan ke {isVoiceOnly ? "voice" : "video"} call...
          </Text>
          <Text style={styles.loadingSubtext}>Room: {roomName}</Text>
        </View>
      )}
      <View style={styles.header}>
        <Pressable style={styles.leaveButton} onPress={handleLeave}>
          <Feather name="phone-off" size={18} color="#fff" />
          <Text style={styles.leaveText}>Keluar</Text>
        </Pressable>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: jitsiUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        injectedJavaScript={injectedJS}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError("Gagal memuat Jitsi Meet");
          setLoading(false);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "loaded") {
              setLoading(false);
            }
          } catch {}
        }}
        allowsFullscreenVideo
        mediaCapturePermissionGrantType="grant"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  leaveText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
  },
  loadingSubtext: {
    color: "#999",
    fontSize: 12,
    marginTop: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
    textAlign: "center",
  },
  backButton: {
    marginTop: 24,
    backgroundColor: "#333",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
