import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { Audio } from "expo-av";
import { Feather } from "@expo/vector-icons";

interface VoiceRecorderProps {
  onRecorded: (uri: string, duration: number, mimeType: string) => void;
  onCancel: () => void;
  colors: any;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecorded, onCancel, colors, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        alert("Izin mikrofon diperlukan untuk merekam pesan suara.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Gagal memulai rekaman.");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  }, []);

  const playPreview = useCallback(async () => {
    if (!recordingUri) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri: recordingUri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
      await sound.playAsync();
      setIsPlaying(true);
    } catch (err) {
      console.error("Playback error:", err);
    }
  }, [recordingUri]);

  const stopPreview = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    if (recordingUri) {
      const mimeType = "audio/mp4";
      onRecorded(recordingUri, duration, mimeType);
    }
  }, [recordingUri, duration, onRecorded]);

  const handleDiscard = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
    }
    setRecordingUri(null);
    setDuration(0);
    if (isRecording && recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    onCancel();
  }, [isRecording, onCancel]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (recordingUri) {
    return (
      <View style={styles.container}>
        <Pressable onPress={handleDiscard} style={styles.iconBtn} hitSlop={8}>
          <Feather name="trash-2" size={20} color={colors.error || "#ef4444"} />
        </Pressable>

        <View style={[styles.previewBar, { backgroundColor: colors.surfaceSecondary }]}>
          <Pressable onPress={isPlaying ? stopPreview : playPreview} style={styles.iconBtn} hitSlop={8}>
            <Feather name={isPlaying ? "pause" : "play"} size={20} color={colors.primary} />
          </Pressable>
          <Text style={[styles.durationText, { color: colors.text }]}>{formatTime(duration)}</Text>
          <View style={[styles.waveform, { backgroundColor: colors.border }]}>
            <View style={[styles.waveformFill, { backgroundColor: colors.primary, width: "100%" }]} />
          </View>
        </View>

        <Pressable
          onPress={handleSend}
          disabled={disabled}
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}
        >
          <Feather name="send" size={16} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={handleDiscard} style={styles.iconBtn} hitSlop={8}>
        <Feather name="x" size={20} color={colors.error || "#ef4444"} />
      </Pressable>

      <View style={styles.recordingInfo}>
        {isRecording ? (
          <>
            <View style={styles.recordingDot} />
            <Text style={[styles.recordingText, { color: "#ef4444" }]}>
              Merekam... {formatTime(duration)}
            </Text>
          </>
        ) : (
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            Tekan mikrofon untuk mulai
          </Text>
        )}
      </View>

      {isRecording ? (
        <Pressable onPress={stopRecording} style={[styles.recordBtn, { backgroundColor: "#ef4444" }]}>
          <Feather name="square" size={18} color="#fff" />
        </Pressable>
      ) : (
        <Pressable
          onPress={startRecording}
          disabled={disabled}
          style={[styles.recordBtn, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}
        >
          <Feather name="mic" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconBtn: {
    padding: 6,
  },
  previewBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  durationText: {
    fontSize: 13,
    fontWeight: "500",
    minWidth: 35,
  },
  waveform: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  waveformFill: {
    height: "100%",
    borderRadius: 2,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  hintText: {
    fontSize: 13,
  },
  recordBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
});
