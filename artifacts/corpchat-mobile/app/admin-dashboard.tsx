import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, FlatList,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

type TabType = "overview" | "audit";

const ACTION_COLORS: Record<string, string> = {
  login_success: "#10B981",
  login_failed: "#EF4444",
  send_message: "#3B82F6",
  edit_message: "#F59E0B",
  delete_message: "#EF4444",
  create_conversation: "#8B5CF6",
  pin_message: "#F59E0B",
  unpin_message: "#6B7280",
  create_user: "#10B981",
  deactivate_user: "#EF4444",
  activate_user: "#10B981",
  reset_password: "#D97706",
  update_user: "#3B82F6",
  import_users: "#8B5CF6",
};

function StatCard({ title, value, icon, color, colors }: {
  title: string; value: string | number; icon: string; color: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

function OverviewTab({ colors }: { colors: any }) {
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/audit/stats"),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const weeklyTrend = stats?.weeklyTrend || 0;
  const trendColor = weeklyTrend >= 0 ? "#10B981" : "#EF4444";
  const trendIcon = weeklyTrend >= 0 ? "trending-up" : "trending-down";

  return (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
    >
      <View style={styles.statsGrid}>
        <StatCard
          title="Total Pengguna"
          value={stats?.totalUsers || 0}
          icon="users"
          color="#3B82F6"
          colors={colors}
        />
        <StatCard
          title="Aktif Hari Ini"
          value={stats?.activeUsersToday || 0}
          icon="activity"
          color="#10B981"
          colors={colors}
        />
        <StatCard
          title="Pesan Hari Ini"
          value={stats?.messagesToday || 0}
          icon="message-circle"
          color="#8B5CF6"
          colors={colors}
        />
        <StatCard
          title="Total Percakapan"
          value={stats?.totalConversations || 0}
          icon="message-square"
          color="#F59E0B"
          colors={colors}
        />
      </View>

      <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.trendRow}>
          <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>Tren Mingguan</Text>
          <View style={styles.trendValue}>
            <Feather name={trendIcon as any} size={16} color={trendColor} />
            <Text style={[styles.trendPercent, { color: trendColor }]}>
              {weeklyTrend >= 0 ? "+" : ""}{weeklyTrend.toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text style={[styles.trendDesc, { color: colors.textSecondary }]}>
          Total Pesan: {stats?.totalMessages?.toLocaleString() || 0}
        </Text>
      </View>

      {stats?.topActiveUsers?.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pengguna Teraktif</Text>
          {stats.topActiveUsers.slice(0, 5).map((u: any, i: number) => (
            <View key={u.userId || i} style={[styles.topUserRow, i < stats.topActiveUsers.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
              <View style={[styles.rankBadge, { backgroundColor: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#B45309" : colors.surfaceSecondary }]}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <Text style={[styles.topUserName, { color: colors.text }]} numberOfLines={1}>{u.userName || u.name || "User"}</Text>
              <Text style={[styles.topUserCount, { color: colors.primary }]}>{u.messageCount} pesan</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function AuditTab({ colors }: { colors: any }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "audit-logs", page],
    queryFn: () => api.get(`/audit/logs?limit=30&page=${page}`),
  });

  const logs = data?.logs || data || [];

  const renderLog = ({ item }: { item: any }) => {
    const actionColor = ACTION_COLORS[item.action] || "#6B7280";
    const actionLabel = (item.action || "").replace(/_/g, " ");
    const ts = item.createdAt ? format(new Date(item.createdAt), "dd MMM HH:mm", { locale: idLocale }) : "";

    return (
      <View style={[styles.logItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.logHeader}>
          <View style={[styles.actionBadge, { backgroundColor: actionColor + "20" }]}>
            <Text style={[styles.actionText, { color: actionColor }]}>{actionLabel}</Text>
          </View>
          <Text style={[styles.logTime, { color: colors.textSecondary }]}>{ts}</Text>
        </View>
        <Text style={[styles.logUser, { color: colors.text }]} numberOfLines={1}>
          {item.userName || item.user?.name || `User #${item.userId}`}
        </Text>
        {item.entityType && (
          <Text style={[styles.logDetail, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.entityType}{item.entityId ? ` #${item.entityId}` : ""}
          </Text>
        )}
        {item.ipAddress && (
          <Text style={[styles.logIp, { color: colors.textSecondary }]}>IP: {item.ipAddress}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.tabContent}>
      <FlatList
        data={logs}
        keyExtractor={(item, i) => `${item.id || i}`}
        renderItem={renderLog}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
        contentContainerStyle={styles.logList}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <View style={styles.center}><Text style={{ color: colors.textSecondary }}>Tidak ada log</Text></View>
          )
        }
        ListFooterComponent={
          logs.length >= 30 ? (
            <View style={styles.paginationRow}>
              <Pressable
                onPress={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={[styles.pageBtn, { backgroundColor: page === 1 ? colors.surfaceSecondary : colors.primary }]}
              >
                <Feather name="chevron-left" size={18} color={page === 1 ? colors.textSecondary : "#fff"} />
              </Pressable>
              <Text style={[styles.pageText, { color: colors.text }]}>Hal. {page}</Text>
              <Pressable
                onPress={() => setPage(p => p + 1)}
                style={[styles.pageBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="chevron-right" size={18} color="#fff" />
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { theme } = useTheme();
  const colors = Colors[theme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  if (user?.role !== "admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Feather name="lock" size={48} color={colors.textSecondary} />
          <Text style={[styles.lockText, { color: colors.textSecondary }]}>Akses khusus Admin</Text>
        </View>
      </View>
    );
  }

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "bar-chart-2" },
    { key: "audit", label: "Audit Log", icon: "file-text" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {tabs.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={[styles.tab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Feather name={t.icon as any} size={16} color={activeTab === t.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === t.key ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "overview" ? <OverviewTab colors={colors} /> : <AuditTab colors={colors} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5, paddingHorizontal: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabContent: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  lockText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 12 },
  statCard: { width: "47%", borderRadius: 12, padding: 14, borderWidth: 0.5, gap: 4 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statTitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  trendCard: { marginHorizontal: 12, borderRadius: 12, padding: 14, borderWidth: 0.5, marginBottom: 12 },
  trendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  trendValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  trendPercent: { fontSize: 16, fontFamily: "Inter_700Bold" },
  trendDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  section: { marginHorizontal: 12, borderRadius: 12, padding: 14, borderWidth: 0.5, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  topUserRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rankBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  topUserName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  topUserCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  logList: { padding: 12, gap: 8 },
  logItem: { borderRadius: 10, padding: 12, borderWidth: 0.5, gap: 4 },
  logHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  logTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  logUser: { fontSize: 14, fontFamily: "Inter_500Medium" },
  logDetail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  logIp: { fontSize: 11, fontFamily: "Inter_400Regular" },
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pageText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
