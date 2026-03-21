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
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: number;
  content?: string;
  type: string;
  senderId: number;
  createdAt: string;
  sender?: { name: string };
}

interface Conversation {
  id: number;
  type: "direct" | "group" | "announcement" | "whatsapp";
  name?: string;
  members: any[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  updatedAt: string;
  whatsappContactPhone?: string;
  whatsappContactName?: string;
}

function getConvName(conv: Conversation, currentUserId?: number) {
  if (conv.name) return conv.name;
  if (conv.type === "direct") {
    const other = conv.members?.find((m: any) => m.userId !== currentUserId);
    return other?.user?.name || "Chat";
  }
  if (conv.type === "whatsapp") {
    return conv.whatsappContactName || `+${conv.whatsappContactPhone}` || "WhatsApp";
  }
  return "Grup";
}

function getConvCico(conv: Conversation, currentUserId?: number) {
  if (conv.type === "direct") {
    const other = conv.members?.find((m: any) => m.userId !== currentUserId);
    return other?.user?.cicoStatus?.status || "absent";
  }
  return undefined;
}

function ConvItem({ conv, currentUserId, colors }: { conv: Conversation; currentUserId?: number; colors: any }) {
  const name = getConvName(conv, currentUserId);
  const cicoStatus = getConvCico(conv, currentUserId);
  const other = conv.type === "direct" ? conv.members?.find((m: any) => m.userId !== currentUserId) : null;
  const isWhatsapp = conv.type === "whatsapp";

  const lastText = conv.lastMessage
    ? (conv.lastMessage.type !== "text" ? "📎 File" : (conv.lastMessage.content || ""))
    : "Belum ada pesan";

  const timestamp = conv.lastMessage?.createdAt || conv.updatedAt;
  const timeStr = timestamp
    ? formatDistanceToNow(new Date(timestamp), { addSuffix: false, locale: idLocale })
    : "";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conv.id.toString(), name, type: conv.type } })}
      style={({ pressed }) => [styles.convItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
    >
      {isWhatsapp ? (
        <View style={[styles.waAvatar, { backgroundColor: "#25D366" }]}>
          <Feather name="phone" size={24} color="#fff" />
        </View>
      ) : conv.type === "group" ? (
        <View style={[styles.waAvatar, { backgroundColor: colors.primary }]}>
          <Feather name="users" size={22} color="#fff" />
        </View>
      ) : (
        <UserAvatar
          name={name}
          avatarUrl={other?.user?.avatarUrl}
          size={52}
          cicoStatus={cicoStatus}
          showCico={conv.type === "direct"}
        />
      )}
      <View style={styles.convMid}>
        <View style={styles.convHeader}>
          <View style={styles.convNameRow}>
            {conv.isPinned && <Feather name="bookmark" size={11} color={colors.primary} />}
            {isWhatsapp && <Feather name="phone" size={11} color="#25D366" />}
            {conv.type === "group" && <Feather name="users" size={11} color={colors.primary} />}
            <Text style={[styles.convName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          </View>
          <Text style={[styles.convTime, { color: colors.textSecondary }]}>{timeStr}</Text>
        </View>
        <View style={styles.convFooter}>
          <Text style={[styles.convLast, { color: colors.textSecondary }]} numberOfLines={1}>{lastText}</Text>
          {conv.unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function ChatsTab() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get("/conversations"),
    refetchInterval: 10000,
  });

  const convs: Conversation[] = data?.conversations || [];
  const filtered = search
    ? convs.filter(c => getConvName(c, user?.id).toLowerCase().includes(search.toLowerCase()))
    : convs;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function startNewChat() {
    router.push("/new-chat");
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Pesan</Text>
        <Pressable onPress={startNewChat} style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Feather name="edit" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cari percakapan..."
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
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="message-circle" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum ada percakapan</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Mulai chat dengan rekan kerja Anda
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <ConvItem conv={item} currentUserId={user?.id} colors={colors} />}
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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  newBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  convItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  convMid: { flex: 1, gap: 3 },
  convHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convNameRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  convTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convLast: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  separator: { height: 0.5, marginLeft: 80 },
  waAvatar: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
