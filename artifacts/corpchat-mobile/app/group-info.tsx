import React, { useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, useColorScheme, Alert, ScrollView, Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";

interface Member {
  userId: number;
  role: "admin" | "member";
  isMuted: boolean;
  user: {
    id: number;
    name: string;
    employeeId: string;
    department?: string;
    position?: string;
    avatarUrl?: string;
  };
}

interface ConversationDetail {
  id: number;
  type: string;
  name: string;
  createdById: number;
  members: Member[];
  isMuted?: boolean;
}

interface User {
  id: number;
  name: string;
  employeeId: string;
  department?: string;
  avatarUrl?: string;
}

export default function GroupInfoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: conv, isLoading, isError, refetch } = useQuery<ConversationDetail>({
    queryKey: ["conversation-detail", id],
    queryFn: () => api.get(`/conversations/${id}`),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users-for-add", addSearch],
    queryFn: () => api.get(`/users?search=${encodeURIComponent(addSearch)}&limit=30`),
    enabled: showAddMember,
  });

  if (isLoading || (!conv && !isError)) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="chevron-left" size={26} color={colors.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Info Grup</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (isError || !conv) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="chevron-left" size={26} color={colors.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Info Grup</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={colors.danger} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Gagal memuat info grup</Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Coba Lagi</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const members = conv.members || [];
  const myMember = members.find(m => m.userId === currentUser?.id);
  const isAdmin = myMember?.role === "admin";
  const isCreator = conv.createdById === currentUser?.id;
  const memberCount = members.length;
  const isMuted = conv.isMuted || myMember?.isMuted;

  const existingMemberIds = new Set(members.map(m => m.userId));
  const availableUsers: User[] = (usersData?.users || []).filter(
    (u: User) => !existingMemberIds.has(u.id) && u.id !== currentUser?.id
  );

  async function doAction(key: string, fn: () => Promise<void>) {
    setActionLoading(key);
    try {
      await fn();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    } catch (e: any) {
      Alert.alert("Gagal", e.message || "Terjadi kesalahan.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleRename() {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === conv.name) {
      setEditing(false);
      return;
    }
    doAction("rename", async () => {
      await api.patch(`/conversations/${id}`, { name: trimmed });
      setEditing(false);
    });
  }

  function handleAddMember(userId: number) {
    doAction(`add-${userId}`, async () => {
      await api.post(`/conversations/${id}/members`, { userId });
      setShowAddMember(false);
      setAddSearch("");
    });
  }

  function confirmRemove(member: Member) {
    Alert.alert(
      "Hapus Anggota",
      `Hapus ${member.user.name} dari grup?`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: () =>
          doAction(`remove-${member.userId}`, () => api.delete(`/conversations/${id}/members/${member.userId}`))
        },
      ]
    );
  }

  function confirmPromote(member: Member) {
    Alert.alert(
      "Jadikan Admin",
      `Jadikan ${member.user.name} sebagai admin?`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Ya", onPress: () =>
          doAction(`promote-${member.userId}`, () => api.post(`/conversations/${id}/members/${member.userId}/promote`, {}))
        },
      ]
    );
  }

  function confirmDemote(member: Member) {
    Alert.alert(
      "Cabut Admin",
      `Cabut status admin ${member.user.name}?`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Ya", onPress: () =>
          doAction(`demote-${member.userId}`, () => api.post(`/conversations/${id}/members/${member.userId}/demote`, {}))
        },
      ]
    );
  }

  function handleMute() {
    doAction("mute", () => api.post(`/conversations/${id}/mute`, {}));
  }

  function confirmLeave() {
    Alert.alert(
      "Keluar Grup",
      "Yakin ingin keluar dari grup ini?",
      [
        { text: "Batal", style: "cancel" },
        { text: "Keluar", style: "destructive", onPress: () =>
          doAction("leave", async () => {
            await api.post(`/conversations/${id}/leave`, {});
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            router.replace("/(tabs)");
          })
        },
      ]
    );
  }

  function confirmDelete() {
    Alert.alert(
      "Hapus Grup",
      "Grup akan dihapus permanen beserta semua pesan. Lanjutkan?",
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: () =>
          doAction("delete", async () => {
            await api.delete(`/conversations/${id}`);
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            router.replace("/(tabs)");
          })
        },
      ]
    );
  }

  function showMemberActions(member: Member) {
    if (member.userId === currentUser?.id) return;
    if (!isAdmin) return;
    if (member.userId === conv.createdById) return;

    const buttons: any[] = [];

    if (member.role === "member") {
      buttons.push({ text: "Jadikan Admin", onPress: () => confirmPromote(member) });
    } else if (member.role === "admin" && member.userId !== conv.createdById) {
      buttons.push({ text: "Cabut Admin", onPress: () => confirmDemote(member) });
    }

    buttons.push({ text: "Hapus dari Grup", style: "destructive", onPress: () => confirmRemove(member) });
    buttons.push({ text: "Batal", style: "cancel" });

    Alert.alert(member.user.name, "Pilih aksi", buttons);
  }

  function getRoleBadge(member: Member) {
    if (member.userId === conv.createdById) return "creator";
    if (member.role === "admin") return "admin";
    return null;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Info Grup</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={[styles.profileSection, { backgroundColor: colors.surface }]}>
          <View style={[styles.groupAvatar, { backgroundColor: colors.primary }]}>
            <Feather name="users" size={32} color="#fff" />
          </View>

          {editing ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={[styles.editNameInput, { color: colors.text, borderColor: colors.primary }]}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                placeholder="Nama grup..."
                placeholderTextColor={colors.textSecondary}
              />
              <Pressable onPress={handleRename} style={[styles.editBtn, { backgroundColor: colors.primary }]}>
                {actionLoading === "rename" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="check" size={16} color="#fff" />
                )}
              </Pressable>
              <Pressable onPress={() => setEditing(false)} style={[styles.editBtn, { backgroundColor: colors.surfaceSecondary }]}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { if (isAdmin) { setNewName(conv.name || ""); setEditing(true); } }}
              style={styles.nameRow}
            >
              <Text style={[styles.groupName, { color: colors.text }]}>{conv.name || "Grup"}</Text>
              {isAdmin && <Feather name="edit-2" size={14} color={colors.textSecondary} />}
            </Pressable>
          )}

          <Text style={[styles.memberCountLabel, { color: colors.textSecondary }]}>
            {memberCount} anggota
          </Text>
        </View>

        <View style={[styles.actionsSection, { backgroundColor: colors.surface }]}>
          <ActionRow
            icon="bell-off"
            label={isMuted ? "Bunyikan Notifikasi" : "Bisukan Notifikasi"}
            colors={colors}
            loading={actionLoading === "mute"}
            onPress={handleMute}
          />
          {isAdmin && (
            <ActionRow
              icon="user-plus"
              label="Tambah Anggota"
              colors={colors}
              onPress={() => setShowAddMember(true)}
            />
          )}
        </View>

        <View style={[styles.membersSection, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ANGGOTA ({memberCount})
          </Text>
          {members.map(member => {
            const badge = getRoleBadge(member);
            const isMe = member.userId === currentUser?.id;
            return (
              <Pressable
                key={member.userId}
                onPress={() => showMemberActions(member)}
                style={({ pressed }) => [
                  styles.memberRow,
                  { backgroundColor: pressed && isAdmin && !isMe ? colors.surfaceSecondary : "transparent" },
                ]}
              >
                <UserAvatar name={member.user.name} size={42} avatarUrl={member.user.avatarUrl} />
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.user.name}{isMe ? " (Anda)" : ""}
                    </Text>
                    {badge === "creator" && (
                      <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                        <Feather name="star" size={10} color="#D97706" />
                        <Text style={[styles.badgeText, { color: "#D97706" }]}>Pembuat</Text>
                      </View>
                    )}
                    {badge === "admin" && (
                      <View style={[styles.badge, { backgroundColor: "#DBEAFE" }]}>
                        <Feather name="shield" size={10} color="#2563EB" />
                        <Text style={[styles.badgeText, { color: "#2563EB" }]}>Admin</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {member.user.position || member.user.department || member.user.employeeId}
                  </Text>
                </View>
                {isAdmin && !isMe && member.userId !== conv.createdById && (
                  <Feather name="more-vertical" size={18} color={colors.textSecondary} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.dangerSection, { backgroundColor: colors.surface }]}>
          {!isCreator && (
            <Pressable onPress={confirmLeave} style={styles.dangerRow}>
              <Feather name="log-out" size={18} color={colors.danger} />
              <Text style={[styles.dangerText, { color: colors.danger }]}>Keluar Grup</Text>
              {actionLoading === "leave" && <ActivityIndicator size="small" color={colors.danger} />}
            </Pressable>
          )}
          {isAdmin && (
            <Pressable onPress={confirmDelete} style={styles.dangerRow}>
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.dangerText, { color: colors.danger }]}>Hapus Grup</Text>
              {actionLoading === "delete" && <ActivityIndicator size="small" color={colors.danger} />}
            </Pressable>
          )}
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <Modal visible={showAddMember} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setShowAddMember(false); setAddSearch(""); }} hitSlop={8}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Tambah Anggota</Text>
            <View style={{ width: 22 }} />
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
              <Feather name="search" size={15} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Cari karyawan..."
                placeholderTextColor={colors.textSecondary}
                value={addSearch}
                onChangeText={setAddSearch}
                autoFocus
              />
            </View>
          </View>

          <FlatList
            data={availableUsers}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleAddMember(item.id)}
                disabled={actionLoading === `add-${item.id}`}
                style={({ pressed }) => [styles.memberRow, { paddingHorizontal: 16, backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              >
                <UserAvatar name={item.name} size={42} avatarUrl={item.avatarUrl} />
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.memberMeta, { color: colors.textSecondary }]}>{item.department || item.employeeId}</Text>
                </View>
                {actionLoading === `add-${item.id}` ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                    <Feather name="plus" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
            ListEmptyComponent={() => (
              <View style={styles.center}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Tidak ada karyawan tersedia</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function ActionRow({ icon, label, colors, loading, onPress }: {
  icon: string; label: string; colors: any; loading?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
    >
      <Feather name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
      {loading && <ActivityIndicator size="small" color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  profileSection: {
    alignItems: "center", paddingVertical: 24, marginBottom: 8,
  },
  groupAvatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  memberCountLabel: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  editNameRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32 },
  editNameInput: {
    flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold",
    borderBottomWidth: 2, paddingBottom: 4, textAlign: "center",
  },
  editBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  actionsSection: { marginBottom: 8, paddingVertical: 4 },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  actionLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  membersSection: { marginBottom: 8, paddingVertical: 8 },
  sectionTitle: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5,
    paddingHorizontal: 20, paddingBottom: 8,
  },
  memberRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  memberInfo: { flex: 1, gap: 2 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dangerSection: { marginBottom: 8, paddingVertical: 4 },
  dangerRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  dangerText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  sep: { height: 0.5, marginLeft: 70 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
});
