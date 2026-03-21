import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Modal, useColorScheme, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCall } from "@/contexts/CallContext";
import Colors from "@/constants/colors";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function CameraPreview({ facing }: { facing: "front" | "back" }) {
  const [permission, requestPermission] = useCameraPermissions();
  const hasRequested = useRef(false);

  useEffect(() => {
    if (!isNative) return;
    if (permission && !permission.granted && !hasRequested.current) {
      hasRequested.current = true;
      requestPermission();
    }
  }, [permission]);

  if (!isNative) {
    return (
      <View style={cameraStyles.placeholder}>
        <Feather name="video-off" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={cameraStyles.placeholderText}>Kamera tidak tersedia di web</Text>
      </View>
    );
  }

  if (!permission || !permission.granted) {
    return (
      <View style={cameraStyles.placeholder}>
        <Feather name="video" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={cameraStyles.placeholderText}>Meminta izin kamera...</Text>
        <Pressable onPress={requestPermission} style={cameraStyles.permBtn}>
          <Text style={cameraStyles.permBtnText}>Izinkan Kamera</Text>
        </Pressable>
      </View>
    );
  }

  return <CameraView style={StyleSheet.absoluteFill} facing={facing} />;
}

const cameraStyles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f0f23",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    marginTop: 12,
  },
  permBtn: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export function IncomingCallModal() {
  const { status, callType, remoteUserName, acceptCall, rejectCall } = useCall();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  if (status !== "ringing") return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{remoteUserName?.charAt(0) || "?"}</Text>
            </View>
            <View style={styles.callTypeBadge}>
              <Feather name={callType === "video" ? "video" : "phone"} size={12} color="#fff" />
            </View>
          </View>

          <Text style={[styles.name, { color: colors.text }]}>{remoteUserName}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {callType === "video" ? "Video" : "Voice"} call masuk...
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={rejectCall} style={[styles.actionBtn, styles.rejectBtn]}>
              <Feather name="phone-off" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={acceptCall} style={[styles.actionBtn, styles.acceptBtn]}>
              <Feather name={callType === "video" ? "video" : "phone"} size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ActiveCallOverlay() {
  const {
    status, callType, remoteUserName,
    isMuted, duration,
    endCall, toggleMute,
  } = useCall();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("front");

  if (status !== "outgoing" && status !== "connected") return null;

  const isVideoCall = callType === "video";

  if (isVideoCall) {
    return (
      <Modal visible transparent animationType="slide">
        <View style={videoStyles.container}>
          {!isVideoOff ? (
            <CameraPreview facing={cameraFacing} />
          ) : (
            <View style={videoStyles.videoOff}>
              <View style={[styles.avatar, styles.avatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarTextLarge}>{remoteUserName?.charAt(0) || "?"}</Text>
              </View>
              <Text style={videoStyles.videoOffText}>Kamera dimatikan</Text>
            </View>
          )}

          <View style={videoStyles.topBar}>
            <View style={videoStyles.topInfo}>
              <Text style={videoStyles.topName}>{remoteUserName}</Text>
              <Text style={videoStyles.topStatus}>
                {status === "outgoing" ? "Memanggil..." : formatDuration(duration)}
              </Text>
            </View>
          </View>

          <View style={videoStyles.remoteAvatar}>
            <View style={[styles.avatar, { backgroundColor: colors.primary, width: 60, height: 60, borderRadius: 30 }]}>
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
                {remoteUserName?.charAt(0) || "?"}
              </Text>
            </View>
          </View>

          <View style={videoStyles.bottomBar}>
            <Pressable
              onPress={() => setCameraFacing(f => f === "front" ? "back" : "front")}
              style={[styles.actionBtn, styles.normalBtn]}
            >
              <Feather name="refresh-cw" size={22} color="#fff" />
            </Pressable>

            <Pressable
              onPress={() => setIsVideoOff(v => !v)}
              style={[styles.actionBtn, isVideoOff ? styles.mutedBtn : styles.normalBtn]}
            >
              <Feather name={isVideoOff ? "video-off" : "video"} size={22} color={isVideoOff ? "#333" : "#fff"} />
            </Pressable>

            <Pressable
              onPress={toggleMute}
              style={[styles.actionBtn, isMuted ? styles.mutedBtn : styles.normalBtn]}
            >
              <Feather name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#333" : "#fff"} />
            </Pressable>

            <Pressable onPress={endCall} style={[styles.actionBtn, styles.endBtn]}>
              <Feather name="phone-off" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.fullOverlay}>
        <View style={styles.callContent}>
          <View style={[styles.avatar, styles.avatarLarge, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarTextLarge}>{remoteUserName?.charAt(0) || "?"}</Text>
          </View>
          <Text style={styles.callName}>{remoteUserName}</Text>
          <Text style={styles.callStatus}>
            {status === "outgoing" ? "Memanggil..." : formatDuration(duration)}
          </Text>
        </View>

        <View style={styles.callActions}>
          <Pressable
            onPress={toggleMute}
            style={[styles.actionBtn, isMuted ? styles.mutedBtn : styles.normalBtn]}
          >
            <Feather name={isMuted ? "mic-off" : "mic"} size={24} color={isMuted ? "#333" : "#fff"} />
          </Pressable>

          <Pressable onPress={endCall} style={[styles.actionBtn, styles.endBtn]}>
            <Feather name="phone-off" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const videoStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  topInfo: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: "center",
  },
  topName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  topStatus: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginTop: 2,
  },
  remoteAvatar: {
    position: "absolute",
    top: 130,
    right: 16,
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 32,
  },
  bottomBar: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  videoOff: {
    flex: 1,
    backgroundColor: "#0f0f23",
    justifyContent: "center",
    alignItems: "center",
  },
  videoOffText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginTop: 12,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: 300,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
  },
  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  avatarTextLarge: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "700",
  },
  callTypeBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 32,
  },
  actions: {
    flexDirection: "row",
    gap: 24,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
  },
  acceptBtn: {
    backgroundColor: "#22c55e",
  },
  normalBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  mutedBtn: {
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ef4444",
  },
  fullOverlay: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 100,
    paddingBottom: 60,
  },
  callContent: {
    alignItems: "center",
  },
  callName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  callStatus: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    marginTop: 8,
  },
  callActions: {
    flexDirection: "row",
    gap: 20,
    alignItems: "center",
  },
});
