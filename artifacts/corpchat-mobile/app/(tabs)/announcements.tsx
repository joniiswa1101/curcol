import React, { useCallback, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, useColorScheme, Pressable, Modal, TextInput,
  ScrollView, Switch, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";

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
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get("/announcements"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; content: string; isPinned: boolean; notifyWhatsapp: boolean }) =>
      api.post("/announcements", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setModalVisible(false);
      setTitle("");
      setContent("");
      setNotifyWhatsapp(false);
      Alert.alert("Berhasil", notifyWhatsapp ? "Pengumuman dibuat & notifikasi WhatsApp terkirim!" : "Pengumuman berhasil dibuat.");
    },
    onError: (e: any) => Alert.alert("Gagal", e.message),
  });

  const announcements: Announcement[] = data?.announcements || [];
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handleSubmit() {
    if (!title.trim() || !content.trim()) {
      Alert.alert("Lengkapi Form", "Judul dan isi pengumuman wajib diisi.");
      return;
    }
    createMutation.mutate({ title, content, isPinned: false, notifyWhatsapp });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Pengumuman</Text>
        {isAdminOrManager && (
          <Pressable
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        )}
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

      {/* Create Announcement Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <ScrollView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.primary }]}>Batal</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Pengumuman Baru</Text>
            <Pressable onPress={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[styles.modalPost, { color: colors.primary }]}>Kirim</Text>}
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Judul</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Contoh: Rapat Q3 Seluruh Karyawan"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Isi Pengumuman</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Tulis isi pengumuman di sini..."
              placeholderTextColor={colors.textSecondary}
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {/* WhatsApp Notification Toggle */}
            <View style={[styles.waToggle, { backgroundColor: notifyWhatsapp ? "#e8fce8" : colors.surface, borderColor: notifyWhatsapp ? "#c8f0c8" : colors.border }]}>
              <View style={[styles.waToggleIcon, { backgroundColor: notifyWhatsapp ? "#25D366" : colors.surfaceSecondary }]}>
                <Feather name="phone" size={18} color={notifyWhatsapp ? "#fff" : colors.textSecondary} />
              </View>
              <View style={styles.waToggleInfo}>
                <Text style={[styles.waToggleTitle, { color: notifyWhatsapp ? "#075E54" : colors.text }]}>
                  Kirim Notifikasi WhatsApp
                </Text>
                <Text style={[styles.waToggleDesc, { color: colors.textSecondary }]}>
                  Pengumuman ini akan dikirim ke WhatsApp pribadi semua karyawan yang sudah mendaftarkan nomor mereka.
                </Text>
              </View>
              <Switch
                value={notifyWhatsapp}
                onValueChange={setNotifyWhatsapp}
                trackColor={{ false: colors.border, true: "#25D366" }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
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
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 14, padding: 16, gap: 10, borderWidth: 0.5 },
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
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalPost: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 20, gap: 8 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, marginTop: 8 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 140, marginBottom: 4 },
  waToggle: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderRadius: 12, padding: 14, marginTop: 8,
  },
  waToggleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  waToggleInfo: { flex: 1, gap: 3 },
  waToggleTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  waToggleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
});
