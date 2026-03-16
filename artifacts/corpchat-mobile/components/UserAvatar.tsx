import React from "react";
import { View, Text, Image, StyleSheet, useColorScheme } from "react-native";
import Colors from "@/constants/colors";
import { CicoStatusBadge } from "./CicoStatusBadge";

interface Props {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  cicoStatus?: "present" | "wfh" | "break" | "absent" | "off";
  showCico?: boolean;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = ["#00C39A", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#EF4444"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return colors[hash % colors.length];
}

export function UserAvatar({ name, avatarUrl, size = 44, cicoStatus, showCico = false }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
          <Text style={[styles.initials, { fontSize: size * 0.36, color: "#fff" }]}>{initials}</Text>
        </View>
      )}
      {showCico && cicoStatus && (
        <View style={[styles.badge, { bottom: -1, right: -1 }]}>
          <CicoStatusBadge status={cicoStatus} size="sm" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  img: { resizeMode: "cover" },
  circle: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "Inter_600SemiBold" },
  badge: { position: "absolute", backgroundColor: "transparent" },
});
