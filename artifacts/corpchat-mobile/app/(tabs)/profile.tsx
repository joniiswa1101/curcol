import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  useColorScheme, Alert, ActivityIndicator, Switch,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import { CicoStatusBadge } from "@/components/CicoStatusBadge";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

function InfoRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const cicoLabels = {
  present: "Hadir (Kantor)",
  wfh: "Work From Home",
  break: "Istirahat",
  absent: "Tidak Hadir",
  off: "Hari Libur",
};

export default function ProfileTab() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const cicoStatus = user?.cicoStatus?.status || "absent";
  const hasCheckedIn = cicoStatus !== "absent" && cicoStatus !== "off";

  const checkInMutation = useMutation({
    mutationFn: (type: "office" | "wfh") =>
      api.post("/cico/checkin", { employeeId: user?.employeeId, type, location: type === "wfh" ? "WFH" : "Kantor" }),
    onSuccess: () => { refreshUser(); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: any) => Alert.alert("Gagal", e.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => api.post("/cico/checkout", { employeeId: user?.employeeId }),
    onSuccess: () => { refreshUser(); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: any) => Alert.alert("Gagal", e.message),
  });

  function handleCheckIn() {
    Alert.alert("Check In", "Pilih mode kerja", [
      { text: "Kantor", onPress: () => checkInMutation.mutate("office") },
      { text: "WFH", onPress: () => checkInMutation.mutate("wfh") },
      { text: "Batal", style: "cancel" },
    ]);
  }

  function handleLogout() {
    Alert.alert("Keluar", "Yakin ingin keluar?", [
      { text: "Batal", style: "cancel" },
      { text: "Keluar", style: "destructive", onPress: logout },
    ]);
  }

  if (!user) return null;

  const checkInTime = user.cicoStatus?.checkInTime
    ? format(new Date(user.cicoStatus.checkInTime), "HH:mm • d MMM", { locale: idLocale })
    : null;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 20 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
      </View>

      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.avatarRow}>
          <UserAvatar name={user.name} size={72} avatarUrl={user.avatarUrl} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{user.name}</Text>
            <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>
              {user.position || user.role} {user.department ? `· ${user.department}` : ""}
            </Text>
            <Text style={[styles.profileEmp, { color: colors.textSecondary }]}>{user.employeeId}</Text>
          </View>
        </View>

        {/* CICO Status */}
        <View style={[styles.cicoSection, { backgroundColor: colors.surfaceSecondary, borderRadius: 12 }]}>
          <View style={styles.cicoRow}>
            <CicoStatusBadge status={cicoStatus} showLabel size="md" />
            <Text style={[styles.cicoLabel, { color: colors.text }]}>
              {cicoLabels[cicoStatus] || "Tidak Hadir"}
            </Text>
          </View>
          {checkInTime && (
            <Text style={[styles.cicoTime, { color: colors.textSecondary }]}>Check-in: {checkInTime}</Text>
          )}
          <View style={styles.cicoActions}>
            {!hasCheckedIn ? (
              <Pressable
                onPress={handleCheckIn}
                disabled={checkInMutation.isPending}
                style={({ pressed }) => [styles.cicoBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
              >
                {checkInMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> :
                  <><Feather name="log-in" size={14} color="#fff" /><Text style={styles.cicoBtnText}>Check In</Text></>}
              </Pressable>
            ) : (
              <Pressable
                onPress={() => checkOutMutation.mutate()}
                disabled={checkOutMutation.isPending}
                style={({ pressed }) => [styles.cicoBtn, { backgroundColor: colors.danger, opacity: pressed ? 0.8 : 1 }]}
              >
                {checkOutMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> :
                  <><Feather name="log-out" size={14} color="#fff" /><Text style={styles.cicoBtnText}>Check Out</Text></>}
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Info */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Informasi Karyawan</Text>
        <InfoRow label="Email" value={user.email} colors={colors} />
        <InfoRow label="Departemen" value={user.department || "-"} colors={colors} />
        <InfoRow label="Jabatan" value={user.position || "-"} colors={colors} />
        <InfoRow label="No. Telepon" value={user.phone || "-"} colors={colors} />
        <InfoRow label="Role" value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} colors={colors} />
      </View>

      {/* Logout */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="log-out" size={18} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Keluar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  profileCard: { margin: 16, borderRadius: 16, padding: 16, gap: 16, borderWidth: 0.5 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileEmp: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cicoSection: { padding: 14, gap: 8 },
  cicoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cicoLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cicoTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cicoActions: { flexDirection: "row", gap: 8 },
  cicoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  cicoBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 4, borderWidth: 0.5 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase", padding: 12, paddingBottom: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1, paddingLeft: 16 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
