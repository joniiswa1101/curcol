import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  useColorScheme, ActivityIndicator, Alert, FlatList, Modal,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type TabType = "overview" | "flags" | "scanner";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#2563EB",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#D97706",
  reviewed: "#2563EB",
  dismissed: "#6B7280",
  escalated: "#DC2626",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  reviewed: "Ditinjau",
  dismissed: "Ditolak",
  escalated: "Eskalasi",
};

const PII_TYPE_LABELS: Record<string, string> = {
  nik: "NIK/KTP",
  email: "Email",
  phone_id: "Telepon",
  credit_card: "Kartu Kredit",
  npwp: "NPWP",
  bank_account: "Rekening Bank",
  passport: "Paspor",
  bpjs: "BPJS",
  ktp: "KTP",
};

function StatCard({ title, value, subtitle, color, colors }: {
  title: string; value: string | number; subtitle?: string; color: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle && <Text style={[styles.statSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
    </View>
  );
}

function OverviewTab({ colors }: { colors: any }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["compliance", "stats"],
    queryFn: () => api.get("/compliance/stats"),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Tidak ada data</Text>
      </View>
    );
  }

  const bySeverity = stats.bySeverity || {};
  const byStatus = stats.byStatus || {};

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.statGrid}>
        <StatCard title="Total Flag" value={stats.total || 0} color={colors.primary} colors={colors} />
        <StatCard title="Menunggu" value={byStatus.pending || 0} color="#D97706" colors={colors} />
        <StatCard title="Kritis" value={bySeverity.critical || 0} color="#DC2626" colors={colors} />
        <StatCard title="Eskalasi" value={byStatus.escalated || 0} color="#DC2626" colors={colors} />
      </View>

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Distribusi Severity</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {Object.entries(bySeverity).map(([key, val]) => (
          <View key={key} style={styles.distRow}>
            <View style={styles.distLabel}>
              <View style={[styles.dot, { backgroundColor: SEVERITY_COLORS[key] || colors.textSecondary }]} />
              <Text style={[styles.distText, { color: colors.text }]}>{key.toUpperCase()}</Text>
            </View>
            <Text style={[styles.distValue, { color: colors.textSecondary }]}>{val as number}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Distribusi Status</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {Object.entries(byStatus).map(([key, val]) => (
          <View key={key} style={styles.distRow}>
            <View style={styles.distLabel}>
              <View style={[styles.dot, { backgroundColor: STATUS_COLORS[key] || colors.textSecondary }]} />
              <Text style={[styles.distText, { color: colors.text }]}>{STATUS_LABELS[key] || key}</Text>
            </View>
            <Text style={[styles.distValue, { color: colors.textSecondary }]}>{val as number}</Text>
          </View>
        ))}
      </View>

      {stats.topUsers && stats.topUsers.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Top Users</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {stats.topUsers.map((u: any, i: number) => (
              <View key={i} style={styles.distRow}>
                <Text style={[styles.distText, { color: colors.text, flex: 1 }]}>{u.userName || `User #${u.userId}`}</Text>
                <Text style={[styles.distValue, { color: colors.textSecondary }]}>{u.count} flag</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function FlagItem({ flag, colors, onReview }: { flag: any; colors: any; onReview: (flag: any) => void }) {
  const piiLabels = (flag.piiTypes || []).map((t: string) => PII_TYPE_LABELS[t] || t);

  return (
    <View style={[styles.flagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.flagHeader}>
        <View style={[styles.badge, { backgroundColor: SEVERITY_COLORS[flag.severity] || colors.textSecondary }]}>
          <Text style={styles.badgeText}>{(flag.severity || "").toUpperCase()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[flag.status] || colors.textSecondary }]}>
          <Text style={styles.badgeText}>{STATUS_LABELS[flag.status] || flag.status}</Text>
        </View>
        <Text style={[styles.flagDate, { color: colors.textSecondary }]}>
          {new Date(flag.createdAt).toLocaleDateString("id-ID")}
        </Text>
      </View>

      <Text style={[styles.flagUser, { color: colors.text }]}>
        {flag.userName || `User #${flag.userId}`}
      </Text>

      <View style={[styles.contentBox, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.contentText, { color: colors.text }]} numberOfLines={3}>
          {flag.redactedContent || flag.originalContent || "-"}
        </Text>
      </View>

      {piiLabels.length > 0 && (
        <View style={styles.piiRow}>
          {piiLabels.map((label: string, i: number) => (
            <View key={i} style={[styles.piiTag, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.piiTagText, { color: colors.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {flag.status === "pending" && (
        <Pressable
          style={({ pressed }) => [styles.reviewBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => onReview(flag)}
        >
          <Feather name="check-circle" size={16} color="#fff" />
          <Text style={styles.reviewBtnText}>Review</Text>
        </Pressable>
      )}
    </View>
  );
}

function FlagsTab({ colors }: { colors: any }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [reviewModal, setReviewModal] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<"reviewed" | "dismissed" | "escalated">("reviewed");

  const { data, isLoading } = useQuery({
    queryKey: ["compliance", "flags", statusFilter],
    queryFn: () => api.get(`/compliance/flags?status=${statusFilter}&limit=50`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note: string }) =>
      api.patch(`/compliance/flags/${id}`, { status, reviewNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
      setReviewModal(null);
      setReviewNote("");
      Alert.alert("Berhasil", "Flag telah diperbarui");
    },
    onError: () => Alert.alert("Error", "Gagal memperbarui flag"),
  });

  const filters = ["pending", "reviewed", "dismissed", "escalated"];

  return (
    <View style={styles.tabContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {filters.map(f => (
          <Pressable
            key={f}
            onPress={() => setStatusFilter(f)}
            style={[
              styles.filterChip,
              {
                backgroundColor: statusFilter === f ? colors.primary : colors.surfaceSecondary,
                borderColor: statusFilter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={{ color: statusFilter === f ? "#fff" : colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }}>
              {STATUS_LABELS[f] || f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data?.flags || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <FlagItem flag={item} colors={colors} onReview={setReviewModal} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="check-circle" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Tidak ada flag {STATUS_LABELS[statusFilter]?.toLowerCase()}</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!reviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Review Flag</Text>

            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Aksi</Text>
            <View style={styles.actionRow}>
              {(["reviewed", "dismissed", "escalated"] as const).map(a => (
                <Pressable
                  key={a}
                  onPress={() => setReviewAction(a)}
                  style={[
                    styles.actionChip,
                    {
                      backgroundColor: reviewAction === a ? STATUS_COLORS[a] : colors.surfaceSecondary,
                      borderColor: reviewAction === a ? STATUS_COLORS[a] : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: reviewAction === a ? "#fff" : colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                    {STATUS_LABELS[a]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Catatan</Text>
            <TextInput
              style={[styles.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder="Catatan review (opsional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => { setReviewModal(null); setReviewNote(""); }}
              >
                <Text style={{ color: colors.text, fontFamily: "Inter_500Medium" }}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (reviewModal) {
                    updateMutation.mutate({ id: reviewModal.id, status: reviewAction, note: reviewNote });
                  }
                }}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Simpan</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScannerTab({ colors }: { colors: any }) {
  const [scanText, setScanText] = useState("");
  const [result, setResult] = useState<any>(null);

  const scanMutation = useMutation({
    mutationFn: (text: string) => api.post("/compliance/scan", { text }),
    onSuccess: (data) => setResult(data),
    onError: () => Alert.alert("Error", "Gagal melakukan scan"),
  });

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.scanLabel, { color: colors.text }]}>Masukkan teks untuk di-scan</Text>
      <TextInput
        style={[styles.scanInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
        value={scanText}
        onChangeText={setScanText}
        placeholder="Ketik atau tempel teks di sini..."
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
      />
      <Pressable
        style={({ pressed }) => [styles.scanBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        onPress={() => { if (scanText.trim()) scanMutation.mutate(scanText.trim()); }}
        disabled={scanMutation.isPending || !scanText.trim()}
      >
        {scanMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="search" size={18} color="#fff" />
            <Text style={styles.scanBtnText}>Scan PII</Text>
          </>
        )}
      </Pressable>

      {result && (
        <View style={[styles.resultCard, {
          backgroundColor: result.hasPII ? "#FEF2F2" : "#F0FDF4",
          borderColor: result.hasPII ? "#FECACA" : "#BBF7D0",
        }]}>
          <View style={styles.resultHeader}>
            <Feather
              name={result.hasPII ? "alert-triangle" : "check-circle"}
              size={24}
              color={result.hasPII ? "#DC2626" : "#16A34A"}
            />
            <Text style={[styles.resultTitle, { color: result.hasPII ? "#DC2626" : "#16A34A" }]}>
              {result.hasPII ? "PII Terdeteksi!" : "Aman — Tidak ada PII"}
            </Text>
          </View>

          {result.hasPII && result.piiTypes && (
            <View style={styles.piiRow}>
              {result.piiTypes.map((t: string, i: number) => (
                <View key={i} style={[styles.piiTag, { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }]}>
                  <Text style={[styles.piiTagText, { color: "#DC2626" }]}>{PII_TYPE_LABELS[t] || t}</Text>
                </View>
              ))}
            </View>
          )}

          {result.redactedContent && (
            <View style={[styles.contentBox, { backgroundColor: "#fff", marginTop: 12 }]}>
              <Text style={[styles.contentLabel, { color: "#6B7280" }]}>Versi Redacted:</Text>
              <Text style={[styles.contentText, { color: "#374151" }]}>{result.redactedContent}</Text>
            </View>
          )}

          {result.severityLabel && (
            <View style={[styles.badge, { backgroundColor: SEVERITY_COLORS[result.severityLabel] || "#6B7280", marginTop: 12, alignSelf: "flex-start" }]}>
              <Text style={styles.badgeText}>Severity: {result.severityLabel.toUpperCase()}</Text>
            </View>
          )}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

export default function ComplianceScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<TabType>(isAdmin ? "overview" : "scanner");

  const tabs: { key: TabType; label: string; icon: string; adminOnly?: boolean }[] = [
    { key: "overview", label: "Ringkasan", icon: "bar-chart-2", adminOnly: true },
    { key: "flags", label: "Flagged", icon: "flag", adminOnly: true },
    { key: "scanner", label: "Scanner", icon: "search" },
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Compliance</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        {visibleTabs.map(tab => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tab,
              activeTab === tab.key && { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Feather name={tab.icon as any} size={16} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
            <Text style={[
              styles.tabText,
              { color: activeTab === tab.key ? colors.primary : colors.textSecondary },
            ]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "overview" && isAdmin && <OverviewTab colors={colors} />}
      {activeTab === "flags" && isAdmin && <FlagsTab colors={colors} />}
      {activeTab === "scanner" && <ScannerTab colors={colors} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabContent: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  statValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statTitle: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  statSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionHeader: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 20, marginBottom: 10 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  distRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  distLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  distText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  distValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  filterRow: { marginBottom: 12, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  flagCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  flagHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  flagDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: "auto" },
  flagUser: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  contentBox: { borderRadius: 8, padding: 10 },
  contentLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  contentText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  piiRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  piiTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  piiTagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reviewBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 12 },
  scanLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  scanInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
    textAlignVertical: "top",
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  scanBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 16 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  modalLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8, marginTop: 12 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
});
