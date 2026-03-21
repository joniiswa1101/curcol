import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  useColorScheme, Alert, ActivityIndicator, TextInput, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
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

function ThemeToggleSection({ colors }: { colors: any }) {
  const { preference, setPreference } = useTheme();

  const options: Array<{ label: string; value: "light" | "dark" | "system" }> = [
    { label: "Terang", value: "light" },
    { label: "Gelap", value: "dark" },
    { label: "Sistem", value: "system" },
  ];

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Tampilan</Text>
      <View style={styles.themeGrid}>
        {options.map(opt => (
          <Pressable
            key={opt.value}
            onPress={() => setPreference(opt.value)}
            style={({ pressed }) => [
              styles.themeOption,
              {
                backgroundColor: preference === opt.value ? colors.primary : colors.surfaceSecondary,
                opacity: pressed ? 0.8 : 1,
                borderColor: preference === opt.value ? colors.primary : colors.border,
              },
            ]}
          >
            <Feather
              name={opt.value === "light" ? "sun" : opt.value === "dark" ? "moon" : "settings"}
              size={20}
              color={preference === opt.value ? "#fff" : colors.primary}
            />
            <Text
              style={[
                styles.themeLabel,
                { color: preference === opt.value ? "#fff" : colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const cicoLabels: Record<string, string> = {
  present: "Hadir (Kantor)",
  wfh: "Work From Home",
  break: "Istirahat",
  absent: "Tidak Hadir",
  off: "Hari Libur",
};

export default function ProfileTab() {
  const { theme } = useTheme();
  const colors = Colors[theme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [waModal, setWaModal] = useState(false);
  const [waNumber, setWaNumber] = useState("");

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

  const updateProfileMutation = useMutation({
    mutationFn: (data: { whatsappNumber?: string | null }) =>
      api.patch(`/users/${user?.id}`, data),
    onSuccess: () => {
      refreshUser();
      setWaModal(false);
      Alert.alert("Berhasil", "Profil berhasil diperbarui.");
    },
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

  function openWaModal() {
    setWaNumber(user?.whatsappNumber || "");
    setWaModal(true);
  }

  function saveWaNumber() {
    updateProfileMutation.mutate({ whatsappNumber: waNumber.trim() || null });
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

      {/* WhatsApp Notification Card */}
      <Pressable
        onPress={openWaModal}
        style={({ pressed }) => [
          styles.waCard,
          {
            backgroundColor: user.whatsappNumber ? "#e8fce8" : colors.surface,
            borderColor: user.whatsappNumber ? "#c8f0c8" : colors.border,
            opacity: pressed ? 0.85 : 1,
          }
        ]}
      >
        <View style={[styles.waCardIcon, { backgroundColor: user.whatsappNumber ? "#25D366" : colors.surfaceSecondary }]}>
          <Feather name="phone" size={20} color={user.whatsappNumber ? "#fff" : colors.textSecondary} />
        </View>
        <View style={styles.waCardInfo}>
          <Text style={[styles.waCardTitle, { color: user.whatsappNumber ? "#075E54" : colors.text }]}>
            Notifikasi WhatsApp
          </Text>
          <Text style={[styles.waCardDesc, { color: colors.textSecondary }]}>
            {user.whatsappNumber
              ? `Aktif: +${user.whatsappNumber}`
              : "Daftarkan nomor WhatsApp untuk terima notifikasi pengumuman"}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>

      {/* Info */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Informasi Karyawan</Text>
        <InfoRow label="Email" value={user.email} colors={colors} />
        <InfoRow label="Departemen" value={user.department || "-"} colors={colors} />
        <InfoRow label="Jabatan" value={user.position || "-"} colors={colors} />
        <InfoRow label="No. Telepon" value={user.phone || "-"} colors={colors} />
        <InfoRow label="Role" value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} colors={colors} />
      </View>

      {/* Theme Toggle */}
      <ThemeToggleSection colors={colors} />

      {/* Compliance */}
      <Pressable
        onPress={() => router.push("/compliance")}
        style={({ pressed }) => [
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name="shield" size={20} color={colors.primary} />
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Compliance</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              {user.role === "admin" ? "Dashboard & PII Scanner" : "PII Scanner"}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>

      {/* Version */}
      <View style={[styles.versionSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.versionLabel, { color: colors.textSecondary }]}>Versi Aplikasi</Text>
        <Text style={[styles.versionNumber, { color: colors.text }]}>v1.1.0</Text>
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

      {/* WhatsApp Number Modal */}
      <Modal visible={waModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setWaModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.primary }]}>Batal</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Notifikasi WhatsApp</Text>
            <Pressable onPress={saveWaNumber} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[styles.modalSave, { color: colors.primary }]}>Simpan</Text>}
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <View style={[styles.waIconBig, { backgroundColor: "#25D366" }]}>
              <Feather name="phone" size={36} color="#fff" />
            </View>
            <Text style={[styles.modalDesc, { color: colors.text }]}>
              Daftarkan nomor WhatsApp kamu agar bisa menerima notifikasi pengumuman penting dari perusahaan langsung di WhatsApp.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nomor WhatsApp</Text>
            <View style={[styles.waInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.waPrefix, { color: colors.textSecondary }]}>+</Text>
              <TextInput
                style={[styles.waInput, { color: colors.text }]}
                placeholder="6281234567890"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                value={waNumber}
                onChangeText={setWaNumber}
              />
            </View>
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Format: kode negara + nomor tanpa tanda +{"\n"}Contoh: 6281234567890 (Indonesia +62)
            </Text>

            {waNumber ? (
              <Pressable
                onPress={() => { setWaNumber(""); updateProfileMutation.mutate({ whatsappNumber: null }); }}
                style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="x-circle" size={16} color={colors.danger} />
                <Text style={[styles.clearBtnText, { color: colors.danger }]}>Hapus nomor WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
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
  waCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1.5,
  },
  waCardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  waCardInfo: { flex: 1 },
  waCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  waCardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 4, borderWidth: 0.5 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase", padding: 12, paddingBottom: 4 },
  themeGrid: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  themeOption: { flex: 1, alignItems: "center", gap: 6, borderRadius: 10, paddingVertical: 12, borderWidth: 1.5 },
  themeLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  versionSection: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 12, borderWidth: 0.5, alignItems: "center", gap: 4 },
  versionLabel: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.3, textTransform: "uppercase" },
  versionNumber: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1, paddingLeft: 16 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 24, gap: 12, alignItems: "center" },
  waIconBig: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  modalDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, alignSelf: "flex-start" },
  waInputWrap: {
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, width: "100%",
  },
  waPrefix: { fontSize: 16, fontFamily: "Inter_500Medium", marginRight: 4 },
  waInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  clearBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
