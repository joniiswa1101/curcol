import React, { useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, useColorScheme,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import { CicoStatusBadge } from "@/components/CicoStatusBadge";

interface User {
  id: number;
  name: string;
  employeeId: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
  cicoStatus?: { status: "present" | "break" | "wfh" | "absent" | "off" };
}

export default function NewChatScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["users", search],
    queryFn: () => api.get(`/users?search=${encodeURIComponent(search)}&limit=30`),
  });

  const users: User[] = (data?.users || []).filter((u: User) => u.id !== currentUser?.id);

  async function startChat(user: User) {
    try {
      const conv = await api.post("/conversations", { type: "direct", memberIds: [user.id] });
      router.replace({ pathname: "/chat/[id]", params: { id: conv.id.toString(), name: user.name } });
    } catch (e: any) {
      console.error("Failed to create conversation:", e.message);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Chat Baru</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cari nama atau departemen..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => startChat(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
            >
              <UserAvatar name={item.name} size={46} avatarUrl={item.avatarUrl} cicoStatus={item.cicoStatus?.status} showCico />
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.position} {item.department ? `· ${item.department}` : ""}
                </Text>
              </View>
              <CicoStatusBadge status={item.cicoStatus?.status || "absent"} showLabel size="sm" />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          ListEmptyComponent={() => (
            <View style={styles.center}>
              <Feather name="users" size={40} color={colors.border} />
              <Text style={[styles.empty, { color: colors.textSecondary }]}>Tidak ada karyawan ditemukan</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  empty: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sep: { height: 0.5, marginLeft: 74 },
});
