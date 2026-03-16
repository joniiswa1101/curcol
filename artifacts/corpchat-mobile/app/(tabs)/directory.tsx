import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, RefreshControl, useColorScheme,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";
import { CicoStatusBadge } from "@/components/CicoStatusBadge";
import { useAuth } from "@/contexts/AuthContext";

interface User {
  id: number;
  name: string;
  employeeId: string;
  email: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
  role: string;
  isActive: boolean;
  cicoStatus?: { status: "present" | "break" | "wfh" | "absent" | "off" };
}

function UserRow({ user, colors, onPress }: { user: User; colors: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
    >
      <UserAvatar
        name={user.name}
        avatarUrl={user.avatarUrl}
        size={48}
        cicoStatus={user.cicoStatus?.status}
        showCico
      />
      <View style={styles.rowInfo}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowName, { color: colors.text }]}>{user.name}</Text>
          <CicoStatusBadge status={user.cicoStatus?.status || "absent"} showLabel size="sm" />
        </View>
        <Text style={[styles.rowPos, { color: colors.textSecondary }]} numberOfLines={1}>
          {user.position || user.role} {user.department ? `· ${user.department}` : ""}
        </Text>
        <Text style={[styles.rowEmp, { color: colors.textSecondary }]}>{user.employeeId}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.border} />
    </Pressable>
  );
}

export default function DirectoryTab() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["users", search],
    queryFn: () => api.get(`/users?search=${encodeURIComponent(search)}&limit=50`),
    refetchInterval: 15000,
  });

  const users: User[] = data?.users || [];
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  async function startChat(user: User) {
    if (user.id === currentUser?.id) return;
    try {
      const conv = await api.post("/conversations", { type: "direct", memberIds: [user.id] });
      router.push({ pathname: "/chat/[id]", params: { id: conv.id.toString(), name: user.name } });
    } catch (e: any) {
      console.error("Failed to start chat:", e.message);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Direktori</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cari karyawan, departemen..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Tidak ada karyawan</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <UserRow user={item} colors={colors} onPress={() => startChat(item)} />
          )}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  rowPos: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowEmp: { fontSize: 11, fontFamily: "Inter_400Regular" },
  separator: { height: 0.5, marginLeft: 76 },
});
