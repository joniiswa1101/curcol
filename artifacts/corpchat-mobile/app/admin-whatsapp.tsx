import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

type TabType = "unassigned" | "assigned" | "resolved";

const TAB_CONFIG: Record<TabType, { label: string; icon: string; color: string; emptyMsg: string }> = {
  unassigned: { label: "Belum Diambil", icon: "inbox", color: "#F59E0B", emptyMsg: "Tidak ada percakapan yang belum ditangani" },
  assigned: { label: "Ditangani", icon: "user-check", color: "#3B82F6", emptyMsg: "Tidak ada percakapan yang sedang ditangani" },
  resolved: { label: "Selesai", icon: "check-circle", color: "#10B981", emptyMsg: "Belum ada percakapan yang selesai" },
};

export default function AdminWhatsAppScreen() {
  const { theme } = useTheme();
  const colors = Colors[theme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("unassigned");

  const { data: status } = useQuery({
    queryKey: ["admin", "whatsapp", "status"],
    queryFn: () => api.get("/admin/whatsapp/status"),
  });

  const { data: conversationsData, isLoading, refetch } = useQuery({
    queryKey: ["admin", "whatsapp", "conversations"],
    queryFn: () => api.get("/admin/whatsapp/conversations"),
  });

  const allConvs = conversationsData?.conversations || [];
  const filteredConvs = allConvs.filter((c: any) => {
    if (activeTab === "unassigned") return !c.assignedToId && c.waStatus !== "resolved";
    if (activeTab === "assigned") return c.assignedToId && c.waStatus !== "resolved";
    return c.waStatus === "resolved";
  });

  const assignMutation = useMutation({
    mutationFn: (convId: number) => api.patch(`/admin/whatsapp/conversations/${convId}/assign`, { assignedToId: user?.id }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "conversations"] }); },
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  const unassignMutation = useMutation({
    mutationFn: (convId: number) => api.patch(`/admin/whatsapp/conversations/${convId}/unassign`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "conversations"] }); },
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  const resolveMutation = useMutation({
    mutationFn: (convId: number) => api.patch(`/admin/whatsapp/conversations/${convId}/resolve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "conversations"] }); },
    onError: (err: any) => Alert.alert("Gagal", err.message || "Terjadi kesalahan"),
  });

  if (user?.role !== "admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={24} color={colors.text} /></Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>WhatsApp Inbox</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Feather name="lock" size={48} color={colors.textSecondary} />
          <Text style={[styles.lockText, { color: colors.textSecondary }]}>Akses khusus Admin</Text>
        </View>
      </View>
    );
  }

  const isConfigured = status?.configured || status?.twilioConfigured;
  const waPhone = status?.phoneNumber || status?.whatsappNumber || "-";

  const renderConversation = ({ item }: { item: any }) => {
    const contactName = item.whatsappContactName || item.name || "WhatsApp Contact";
    const contactPhone = item.whatsappContactPhone || "";
    const updatedAt = item.updatedAt ? format(new Date(item.updatedAt), "dd MMM HH:mm", { locale: idLocale }) : "";
    const assigneeName = item.assignedTo?.name || "";
    const isPending = assignMutation.isPending || unassignMutation.isPending || resolveMutation.isPending;

    return (
      <View style={[styles.convCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.convHeader}>
          <View style={[styles.convAvatar, { backgroundColor: "#25D36620" }]}>
            <Feather name="phone" size={20} color="#25D366" />
          </View>
          <View style={styles.convInfo}>
            <Text style={[styles.convName, { color: colors.text }]} numberOfLines={1}>{contactName}</Text>
            {contactPhone ? <Text style={[styles.convPhone, { color: colors.textSecondary }]}>{contactPhone}</Text> : null}
          </View>
          <Text style={[styles.convTime, { color: colors.textSecondary }]}>{updatedAt}</Text>
        </View>

        {assigneeName && activeTab === "assigned" && (
          <View style={styles.assigneeRow}>
            <Feather name="user" size={12} color={colors.textSecondary} />
            <Text style={[styles.assigneeText, { color: colors.textSecondary }]}>Ditangani: {assigneeName}</Text>
          </View>
        )}

        <View style={styles.convActions}>
          <Pressable
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id, type: "whatsapp" } })}
            style={[styles.convBtn, { backgroundColor: "#25D36620" }]}
          >
            <Feather name="message-circle" size={14} color="#25D366" />
            <Text style={[styles.convBtnText, { color: "#25D366" }]}>Buka</Text>
          </Pressable>

          {activeTab === "unassigned" && (
            <Pressable
              onPress={() => assignMutation.mutate(item.id)}
              disabled={isPending}
              style={[styles.convBtn, { backgroundColor: colors.primary + "20" }]}
            >
              {assignMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : (
                <><Feather name="user-plus" size={14} color={colors.primary} /><Text style={[styles.convBtnText, { color: colors.primary }]}>Ambil</Text></>
              )}
            </Pressable>
          )}

          {activeTab === "assigned" && (
            <>
              <Pressable
                onPress={() => resolveMutation.mutate(item.id)}
                disabled={isPending}
                style={[styles.convBtn, { backgroundColor: "#10B98120" }]}
              >
                <Feather name="check" size={14} color="#10B981" />
                <Text style={[styles.convBtnText, { color: "#10B981" }]}>Selesai</Text>
              </Pressable>
              <Pressable
                onPress={() => unassignMutation.mutate(item.id)}
                disabled={isPending}
                style={[styles.convBtn, { backgroundColor: "#F59E0B20" }]}
              >
                <Feather name="x" size={14} color="#F59E0B" />
                <Text style={[styles.convBtnText, { color: "#F59E0B" }]}>Lepas</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  const unassignedCount = allConvs.filter((c: any) => !c.waAssignedTo && c.waStatus !== "resolved").length;
  const assignedCount = allConvs.filter((c: any) => c.waAssignedTo && c.waStatus !== "resolved").length;
  const resolvedCount = allConvs.filter((c: any) => c.waStatus === "resolved").length;
  const tabCounts: Record<TabType, number> = { unassigned: unassignedCount, assigned: assignedCount, resolved: resolvedCount };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="arrow-left" size={24} color={colors.text} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>WhatsApp Inbox</Text>
        <Pressable onPress={() => refetch()} hitSlop={8}><Feather name="refresh-cw" size={20} color={colors.textSecondary} /></Pressable>
      </View>

      <View style={[styles.statusBar, { backgroundColor: isConfigured ? "#25D36615" : "#EF444415", borderColor: isConfigured ? "#25D366" : "#EF4444" }]}>
        <View style={[styles.statusDot, { backgroundColor: isConfigured ? "#25D366" : "#EF4444" }]} />
        <Text style={[styles.statusText, { color: isConfigured ? "#25D366" : "#EF4444" }]}>
          {isConfigured ? `Terhubung · ${waPhone}` : "Twilio belum dikonfigurasi"}
        </Text>
        <Text style={[styles.statusCount, { color: colors.textSecondary }]}>{allConvs.length} percakapan</Text>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(["unassigned", "assigned", "resolved"] as TabType[]).map(t => {
          const cfg = TAB_CONFIG[t];
          const isActive = activeTab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tab, isActive && { borderBottomColor: cfg.color, borderBottomWidth: 2 }]}
            >
              <Feather name={cfg.icon as any} size={15} color={isActive ? cfg.color : colors.textSecondary} />
              <Text style={[styles.tabText, { color: isActive ? cfg.color : colors.textSecondary }]}>{cfg.label}</Text>
              {tabCounts[t] > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: isActive ? cfg.color : colors.surfaceSecondary }]}>
                  <Text style={[styles.tabBadgeText, { color: isActive ? "#fff" : colors.textSecondary }]}>{tabCounts[t]}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filteredConvs}
        keyExtractor={(item) => `${item.id}`}
        renderItem={renderConversation}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
        contentContainerStyle={styles.convList}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <View style={styles.center}>
              <Feather name={TAB_CONFIG[activeTab].icon as any} size={40} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular" }}>
                {TAB_CONFIG[activeTab].emptyMsg}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  lockText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  statusBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 10, gap: 8, borderWidth: 0.5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  statusCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5, paddingHorizontal: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  convList: { padding: 12, gap: 10 },
  convCard: { borderRadius: 12, padding: 12, borderWidth: 0.5, gap: 8 },
  convHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  convAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  convInfo: { flex: 1 },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  convPhone: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  assigneeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 52 },
  assigneeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convActions: { flexDirection: "row", gap: 8, paddingLeft: 52 },
  convBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  convBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
