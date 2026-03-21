import React, { useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, useColorScheme, Alert,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";

interface User {
  id: number;
  name: string;
  employeeId: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
}

export default function NewGroupScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedMap, setSelectedMap] = useState<Record<number, User>>({});
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", search],
    queryFn: () => api.get(`/users?search=${encodeURIComponent(search)}&limit=50`),
  });

  const users: User[] = (data?.users || []).filter((u: User) => u.id !== currentUser?.id);
  const selectedIds = Object.keys(selectedMap).map(Number);
  const selectedUsers = Object.values(selectedMap);

  function toggleUser(user: User) {
    setSelectedMap(prev => {
      const next = { ...prev };
      if (next[user.id]) {
        delete next[user.id];
      } else {
        next[user.id] = user;
      }
      return next;
    });
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name) {
      Alert.alert("Nama Grup", "Masukkan nama grup.");
      return;
    }
    if (selectedIds.length < 1) {
      Alert.alert("Anggota", "Pilih minimal 1 anggota.");
      return;
    }
    setCreating(true);
    try {
      const conv = await api.post("/conversations", {
        type: "group",
        name,
        memberIds: selectedIds,
      });
      router.replace({ pathname: "/chat/[id]", params: { id: conv.id.toString(), name, type: "group" } });
    } catch (e: any) {
      Alert.alert("Gagal", e.message || "Gagal membuat grup.");
    } finally {
      setCreating(false);
    }
  }

  const canCreate = groupName.trim().length > 0 && selectedIds.length >= 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Grup Baru</Text>
        <Pressable onPress={createGroup} disabled={!canCreate || creating} hitSlop={8}>
          {creating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.createBtn, { color: canCreate ? colors.primary : colors.textSecondary }]}>Buat</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.nameSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.groupIcon, { backgroundColor: colors.primary }]}>
          <Feather name="users" size={20} color="#fff" />
        </View>
        <TextInput
          style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
          placeholder="Nama Grup"
          placeholderTextColor={colors.textSecondary}
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
        />
      </View>

      {selectedIds.length > 0 && (
        <View style={[styles.selectedSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <FlatList
            data={selectedUsers}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => toggleUser(item)} style={styles.selectedChip}>
                <UserAvatar name={item.name} size={40} avatarUrl={item.avatarUrl} />
                <View style={[styles.removeChip, { backgroundColor: colors.danger }]}>
                  <Feather name="x" size={10} color="#fff" />
                </View>
                <Text style={[styles.chipName, { color: colors.text }]} numberOfLines={1}>{item.name.split(" ")[0]}</Text>
              </Pressable>
            )}
          />
          <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
            {selectedIds.length} anggota dipilih
          </Text>
        </View>
      )}

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cari karyawan..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
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
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <Pressable
                onPress={() => toggleUser(item)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              >
                <UserAvatar name={item.name} size={42} avatarUrl={item.avatarUrl} />
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.position}{item.department ? ` · ${item.department}` : ""}
                  </Text>
                </View>
                <View style={[styles.checkbox, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {selected && <Feather name="check" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          }}
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
  createBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  nameSection: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  groupIcon: {
    width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center",
  },
  nameInput: {
    flex: 1, fontSize: 16, fontFamily: "Inter_500Medium",
    borderBottomWidth: 1, paddingBottom: 6,
  },
  selectedSection: {
    paddingVertical: 12, borderBottomWidth: 0.5, gap: 6,
  },
  selectedChip: { alignItems: "center", width: 56 },
  removeChip: {
    position: "absolute", top: -2, right: 2, width: 18, height: 18,
    borderRadius: 9, alignItems: "center", justifyContent: "center",
  },
  chipName: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  selectedCount: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 16 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  empty: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center",
  },
  sep: { height: 0.5, marginLeft: 70 },
});
