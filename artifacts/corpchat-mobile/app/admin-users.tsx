import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, FlatList, TextInput,
  ActivityIndicator, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import Colors from "@/constants/colors";
import { api, APIError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { UserAvatar } from "@/components/UserAvatar";

const ROLE_COLORS: Record<string, string> = {
  admin: "#DC2626",
  manager: "#2563EB",
  employee: "#10B981",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Karyawan",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    if (vals.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

function mapCSVRow(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (val) return val;
    }
    return "";
  };
  return {
    employeeId: get("employeeid", "employee_id", "nik", "id_karyawan", "nip"),
    name: get("name", "nama", "nama_lengkap", "full_name", "fullname"),
    email: get("email", "email_address"),
    department: get("department", "departemen", "dept", "divisi"),
    position: get("position", "jabatan", "posisi"),
    phone: get("phone", "telepon", "no_telp", "no_hp", "handphone"),
    role: get("role", "peran") || "employee",
  };
}

export default function AdminUsersScreen() {
  const { theme } = useTheme();
  const colors = Colors[theme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<any>(null);

  const [form, setForm] = useState({
    employeeId: "", name: "", email: "", department: "", position: "", phone: "", role: "employee",
  });

  const { data: usersData, isLoading, refetch } = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => api.get(`/users?search=${encodeURIComponent(search)}&limit=100`),
  });

  const users = usersData?.users || usersData || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/users", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setShowAddModal(false);
      setForm({ employeeId: "", name: "", email: "", department: "", position: "", phone: "", role: "employee" });
      Alert.alert("Berhasil", `User ${res.name || form.name} berhasil ditambahkan.\nPassword default: ${form.employeeId}`);
    },
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) =>
      isActive ? api.post(`/users/${userId}/deactivate`, {}) : api.patch(`/users/${userId}`, { isActive: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ employeeId }: { userId: number; employeeId: string }) =>
      api.post("/auth/reset-password", { targetEmployeeId: employeeId }),
    onSuccess: (_, vars) => Alert.alert("Berhasil", `Password di-reset ke: ${vars.employeeId}`),
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  const importMutation = useMutation({
    mutationFn: (data: any[]) => api.post("/users/import", { users: data }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setImportResult(res);
    },
    onError: (err: any) => Alert.alert("Gagal Import", err.message || "Terjadi kesalahan"),
  });

  const handleCSVPick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      const parsed = parseCSV(content);
      if (parsed.length === 0) {
        Alert.alert("Error", "File CSV kosong atau format tidak valid.");
        return;
      }
      const mapped = parsed.map(mapCSVRow).filter(r => r.name && r.employeeId && r.email);
      if (mapped.length === 0) {
        Alert.alert("Error", "Tidak ditemukan data valid. Pastikan kolom employeeId/NIK, name/nama, dan email ada.");
        return;
      }
      setImportData(mapped);
      setImportResult(null);
      setShowImportModal(true);
    } catch (e) {
      Alert.alert("Error", "Gagal membaca file.");
    }
  }, []);

  const handleUserAction = useCallback((u: any) => {
    const actions: any[] = [
      { text: u.isActive ? "Nonaktifkan" : "Aktifkan", onPress: () => {
        Alert.alert(
          u.isActive ? "Nonaktifkan User" : "Aktifkan User",
          `${u.isActive ? "Nonaktifkan" : "Aktifkan"} ${u.name}?`,
          [
            { text: "Batal", style: "cancel" },
            { text: "Ya", style: u.isActive ? "destructive" : "default", onPress: () => deactivateMutation.mutate({ userId: u.id, isActive: u.isActive }) },
          ]
        );
      }},
      { text: "Reset Password", onPress: () => {
        Alert.alert("Reset Password", `Reset password ${u.name} ke Employee ID (${u.employeeId})?`, [
          { text: "Batal", style: "cancel" },
          { text: "Reset", style: "destructive", onPress: () => resetPasswordMutation.mutate({ userId: u.id, employeeId: u.employeeId }) },
        ]);
      }},
      { text: "Batal", style: "cancel" },
    ];
    Alert.alert(u.name, `${u.email}\nRole: ${ROLE_LABELS[u.role] || u.role}`, actions);
  }, []);

  if (user?.role !== "admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={24} color={colors.text} /></Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Kelola Pengguna</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Feather name="lock" size={48} color={colors.textSecondary} />
          <Text style={[styles.lockText, { color: colors.textSecondary }]}>Akses khusus Admin</Text>
        </View>
      </View>
    );
  }

  const renderUser = ({ item }: { item: any }) => {
    const roleColor = ROLE_COLORS[item.role] || "#6B7280";
    return (
      <Pressable
        onPress={() => handleUserAction(item)}
        style={({ pressed }) => [styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      >
        <UserAvatar name={item.name} avatarUrl={item.avatarUrl} size={42} />
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {!item.isActive && (
              <View style={[styles.statusBadge, { backgroundColor: "#EF444420" }]}>
                <Text style={[styles.statusText, { color: "#EF4444" }]}>Nonaktif</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>{item.email}</Text>
          <View style={styles.userMeta}>
            <View style={[styles.roleBadge, { backgroundColor: roleColor + "20" }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{ROLE_LABELS[item.role] || item.role}</Text>
            </View>
            {item.department && <Text style={[styles.userDept, { color: colors.textSecondary }]}>{item.department}</Text>}
          </View>
        </View>
        <Feather name="more-vertical" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={24} color={colors.text} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Kelola Pengguna</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.actionBar}>
        <Pressable onPress={() => setShowAddModal(true)} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
          <Feather name="user-plus" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Tambah</Text>
        </Pressable>
        <Pressable onPress={handleCSVPick} style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}>
          <Feather name="upload" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Import CSV</Text>
        </Pressable>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Cari nama, email, departemen..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}><Feather name="x" size={18} color={colors.textSecondary} /></Pressable>
        ) : null}
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => `${item.id}`}
        renderItem={renderUser}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
        contentContainerStyle={styles.userList}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <View style={styles.center}><Text style={{ color: colors.textSecondary }}>Tidak ada pengguna ditemukan</Text></View>
          )
        }
      />

      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Text style={[styles.modalCancel, { color: colors.primary }]}>Batal</Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Tambah Pengguna</Text>
              <Pressable
                onPress={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.employeeId || !form.name || !form.email}
              >
                {createMutation.isPending
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.modalSave, { color: colors.primary, opacity: (!form.employeeId || !form.name || !form.email) ? 0.4 : 1 }]}>Simpan</Text>}
              </Pressable>
            </View>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
              {[
                { key: "employeeId", label: "Employee ID / NIK *", placeholder: "Contoh: 12345" },
                { key: "name", label: "Nama Lengkap *", placeholder: "Nama karyawan" },
                { key: "email", label: "Email *", placeholder: "email@perusahaan.com", keyboardType: "email-address" },
                { key: "department", label: "Departemen", placeholder: "IT, HR, Finance..." },
                { key: "position", label: "Jabatan", placeholder: "Staff, Lead, Manager..." },
                { key: "phone", label: "No. Telepon", placeholder: "08xxxxxxxxxx", keyboardType: "phone-pad" },
              ].map(f => (
                <View key={f.key} style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={(form as any)[f.key]}
                    onChangeText={(v) => setForm(prev => ({ ...prev, [f.key]: v }))}
                    keyboardType={(f as any).keyboardType || "default"}
                    autoCapitalize={f.key === "email" ? "none" : "words"}
                  />
                </View>
              ))}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Role</Text>
                <View style={styles.roleRow}>
                  {["employee", "manager", "admin"].map(r => (
                    <Pressable
                      key={r}
                      onPress={() => setForm(prev => ({ ...prev, role: r }))}
                      style={[styles.roleOption, { backgroundColor: form.role === r ? (ROLE_COLORS[r] || colors.primary) : colors.surfaceSecondary, borderColor: colors.border }]}
                    >
                      <Text style={[styles.roleOptionText, { color: form.role === r ? "#fff" : colors.text }]}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={[styles.formHint, { color: colors.textSecondary }]}>
                Password default: Employee ID
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => { setShowImportModal(false); setImportData([]); setImportResult(null); }}>
              <Text style={[styles.modalCancel, { color: colors.primary }]}>Tutup</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Import CSV</Text>
            {!importResult ? (
              <Pressable
                onPress={() => importMutation.mutate(importData)}
                disabled={importMutation.isPending || importData.length === 0}
              >
                {importMutation.isPending
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.modalSave, { color: colors.primary }]}>Import</Text>}
              </Pressable>
            ) : <View style={{ width: 50 }} />}
          </View>

          {importResult ? (
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
              <View style={[styles.importResultCard, { backgroundColor: "#10B98120", borderColor: "#10B981" }]}>
                <Feather name="check-circle" size={24} color="#10B981" />
                <Text style={[styles.importResultTitle, { color: "#10B981" }]}>Import Selesai</Text>
              </View>
              <View style={[styles.importStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.importStatLabel, { color: colors.textSecondary }]}>Berhasil Dibuat</Text>
                <Text style={[styles.importStatValue, { color: "#10B981" }]}>{importResult.created || 0}</Text>
              </View>
              <View style={[styles.importStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.importStatLabel, { color: colors.textSecondary }]}>Dilewati (Duplikat)</Text>
                <Text style={[styles.importStatValue, { color: "#F59E0B" }]}>{importResult.skipped || 0}</Text>
              </View>
              {(importResult.errors?.length > 0) && (
                <View style={[styles.importStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.importStatLabel, { color: colors.textSecondary }]}>Error</Text>
                  <Text style={[styles.importStatValue, { color: "#EF4444" }]}>{importResult.errors.length}</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={importData}
              keyExtractor={(_, i) => `${i}`}
              contentContainerStyle={styles.formContent}
              ListHeaderComponent={
                <Text style={[styles.importPreviewTitle, { color: colors.text }]}>
                  Preview: {importData.length} data ditemukan
                </Text>
              }
              renderItem={({ item, index }) => (
                <View style={[styles.importRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.importRowNum, { color: colors.textSecondary }]}>{index + 1}</Text>
                  <View style={styles.importRowInfo}>
                    <Text style={[styles.importRowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.importRowEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.employeeId} · {item.email || "-"} · {item.department || "-"}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  lockText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  actionBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 0.5 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  userList: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 0.5 },
  userInfo: { flex: 1, gap: 2 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  userMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  userDept: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  modalCancel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  formScroll: { flex: 1 },
  formContent: { padding: 16, gap: 16 },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  formInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 0.5 },
  formHint: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  roleRow: { flexDirection: "row", gap: 10 },
  roleOption: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 0.5 },
  roleOptionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  importPreviewTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  importRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, borderWidth: 0.5, marginBottom: 6 },
  importRowNum: { width: 24, fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  importRowInfo: { flex: 1 },
  importRowName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  importRowEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  importResultCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 12, borderWidth: 1 },
  importResultTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  importStat: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, borderWidth: 0.5 },
  importStatLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  importStatValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
});
