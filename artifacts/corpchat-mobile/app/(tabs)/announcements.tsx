import React, { useCallback, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, useColorScheme, Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";

interface Announcement {
  id: number;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author?: { name: string; department?: string; avatarUrl?: string };
}

function AnnCard({ item, colors }: { item: Announcement; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = format(new Date(item.createdAt), "d MMMM yyyy • HH:mm", { locale: idLocale });

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {item.isPinned && (
        <View style={[styles.pinnedBadge, { backgroundColor: colors.primary + "20" }]}>
          <Feather name="bookmark" size={11} color={colors.primary} />
          <Text style={[styles.pinnedText, { color: colors.primary }]}>Disematkan</Text>
        </View>
      )}
      <Text style={[styles.annTitle, { color: colors.text }]}>{item.title}</Text>
      <Text
        style={[styles.annContent, { color: colors.textSecondary }]}
        numberOfLines={expanded ? undefined : 3}
      >
        {item.content}
      </Text>
      {item.content.length > 120 && (
        <Text style={[styles.readMore, { color: colors.primary }]}>
          {expanded ? "Sembunyikan" : "Baca selengkapnya"}
        </Text>
      )}
      <View style={styles.annFooter}>
        {item.author && (
          <View style={styles.authorRow}>
            <UserAvatar name={item.author.name} size={20} avatarUrl={item.author.avatarUrl} />
            <Text style={[styles.authorName, { color: colors.textSecondary }]}>
              {item.author.name}
              {item.author.department ? ` · ${item.author.department}` : ""}
            </Text>
          </View>
        )}
        <Text style={[styles.annDate, { color: colors.textSecondary }]}>{dateStr}</Text>
      </View>
    </Pressable>
  );
}

export default function AnnouncementsTab() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get("/announcements"),
  });

  const announcements: Announcement[] = data?.announcements || [];
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Pengumuman</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : announcements.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum ada pengumuman</Text>
        </View>
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <AnnCard item={item} colors={colors} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  card: {
    borderRadius: 14, padding: 16, gap: 10, borderWidth: 0.5,
  },
  pinnedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  pinnedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  annTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  annContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  readMore: { fontSize: 13, fontFamily: "Inter_500Medium" },
  annFooter: { gap: 6, marginTop: 4 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authorName: { fontSize: 12, fontFamily: "Inter_500Medium" },
  annDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
