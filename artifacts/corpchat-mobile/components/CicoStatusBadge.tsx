import React from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
import Colors from "@/constants/colors";

type CicoStatus = "present" | "wfh" | "break" | "absent" | "off";

interface Props {
  status: CicoStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const labels: Record<CicoStatus, string> = {
  present: "Hadir",
  wfh: "WFH",
  break: "Istirahat",
  absent: "Tidak Hadir",
  off: "Off",
};

export function CicoStatusBadge({ status, showLabel = false, size = "sm" }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const dotColor = colors.cico[status] || colors.offline;
  const dotSize = size === "sm" ? 8 : 11;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: dotColor }]} />
      {showLabel && (
        <Text style={[styles.label, { color: dotColor, fontSize: size === "sm" ? 11 : 12 }]}>
          {labels[status]}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: {},
  label: { fontFamily: "Inter_500Medium" },
});
