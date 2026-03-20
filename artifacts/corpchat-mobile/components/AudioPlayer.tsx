import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Audio } from "expo-av";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";

interface AudioPlayerProps {
  src: string;
  isMine?: boolean;
  colors: any;
}

export function AudioPlayer({ src, isMine, colors }: AudioPlayerProps) {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const loadAndPlay = useCallback(async () => {
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
            return;
          } else {
            await soundRef.current.playAsync();
            setIsPlaying(true);
            return;
          }
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const baseUrl = src.startsWith("http") ? src : `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}${src}`;
      const token = user?.token || "";
      const authUrl = baseUrl.includes("?") ? `${baseUrl}&token=${token}` : `${baseUrl}?token=${token}`;

      const { sound } = await Audio.Sound.createAsync({ uri: authUrl });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setCurrentTime(status.positionMillis / 1000);
          if (status.durationMillis) setDuration(status.durationMillis / 1000);
          if (status.didJustFinish) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        }
      });

      await sound.playAsync();
      setIsPlaying(true);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  }, [src, isPlaying, user?.token]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      <Pressable onPress={loadAndPlay} style={[styles.playBtn, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : `${colors.primary}20` }]}>
        <Feather
          name={isPlaying ? "pause" : "play"}
          size={16}
          color={isMine ? "#fff" : colors.primary}
        />
      </Pressable>
      <View style={styles.waveformContainer}>
        <View style={[styles.progressBg, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : `${colors.primary}20` }]}>
          <View
            style={[styles.progressFill, {
              backgroundColor: isMine ? "rgba(255,255,255,0.8)" : colors.primary,
              width: `${progress}%`,
            }]}
          />
        </View>
        <Text style={[styles.timeText, { color: isMine ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}>
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 160,
    maxWidth: 220,
    paddingVertical: 2,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  waveformContainer: {
    flex: 1,
    gap: 3,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  timeText: {
    fontSize: 10,
  },
});
